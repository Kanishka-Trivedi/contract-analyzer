import { NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, documents, messages } from '@/lib/db/schema';
import { runAgent } from '@/lib/agent/run';
import type { LLMMessage } from '@/lib/llm/client';

const bodySchema = z.object({
  conversationId: z.number().int().positive().optional(),
  docIds: z.array(z.number().int().positive()).min(1),
  message: z.string().trim().min(1),
});

const json = (value: unknown) => JSON.stringify(value) + '\n';

export async function POST(request: Request) {
  let conversationId: number | undefined;
  let userMessageId: number | undefined;
  try {
    const body = bodySchema.parse(await request.json());
    const docIds = [...new Set(body.docIds)];
    const selectedDocs = await db.select({ id: documents.id }).from(documents)
      .where(and(inArray(documents.id, docIds), eq(documents.status, 'ready')));
    if (selectedDocs.length !== docIds.length) return NextResponse.json({ error: 'One or more documents are not ready' }, { status: 400 });

    let history: LLMMessage[] = [];
    if (body.conversationId) {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, body.conversationId));
      if (!conversation || JSON.stringify(conversation.doc_ids) !== JSON.stringify(docIds)) return NextResponse.json({ error: 'Conversation not found for these documents' }, { status: 404 });
      conversationId = conversation.id;
      const prior = await db.select({ role: messages.role, content: messages.content }).from(messages)
        .where(eq(messages.conversation_id, conversationId));
      history = prior.filter((item) => item.role === 'user' || item.role === 'assistant').map((item) => ({ role: item.role as 'user' | 'assistant', content: item.content }));
    } else {
      const [conversation] = await db.insert(conversations).values({ kind: docIds.length > 1 ? 'multi' : 'single', doc_ids: docIds, title: body.message.slice(0, 60) }).returning({ id: conversations.id });
      conversationId = conversation.id;
    }

    const [userMessage] = await db.insert(messages).values({ conversation_id: conversationId, role: 'user', content: body.message, status: 'complete' }).returning({ id: messages.id });
    userMessageId = userMessage.id;

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let answer = '';
        let finalEvent: Extract<import('@/lib/agent/run').AgentEvent, { type: 'done' }> | undefined;
        let lastCoverage: unknown = null;
        const trace: unknown[] = [];
        try {
          for await (const event of runAgent({ docIds, message: body.message, history, signal: request.signal })) {
            if (event.type === 'token') answer += event.text;
            if (event.type === 'done') finalEvent = event;
            if (event.type === 'coverage') lastCoverage = event.coverage;
            if (event.type === 'tool_start' || event.type === 'tool_result') trace.push(event);
            controller.enqueue(encoder.encode(json(event)));
          }
          if (request.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          await db.insert(messages).values({ conversation_id: conversationId!, role: 'assistant', content: answer, status: finalEvent ? 'complete' : 'error', quotes_json: finalEvent?.quotes || null, coverage_json: finalEvent?.coverage || lastCoverage, tool_trace_json: finalEvent?.tool_trace || trace });
          controller.close();
        } catch (error) {
          const stopped = request.signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
          await db.insert(messages).values({ conversation_id: conversationId!, role: 'assistant', content: answer, status: stopped ? 'stopped' : 'error', quotes_json: finalEvent?.quotes || null, coverage_json: finalEvent?.coverage || lastCoverage, tool_trace_json: finalEvent?.tool_trace || trace });
          controller.enqueue(encoder.encode(json(stopped ? { type: 'stopped', conversationId, messageId: userMessageId } : { type: 'error', message: error instanceof Error ? error.message : 'Chat failed' })));
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Invalid chat request' }, { status: 400 });
    console.error('Chat error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chat failed' }, { status: 500 });
  }
}