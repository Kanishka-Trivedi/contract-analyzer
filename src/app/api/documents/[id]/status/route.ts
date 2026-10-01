import { db } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return new Response('Invalid doc ID', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;
      const encoder = new TextEncoder();

      const sendEvent = (data: object) => {
        if (!isClosed) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }
      };

      const poll = async () => {
        try {
          const [doc] = await db.select({
            status: documents.status,
            progress_pct: documents.progress_pct,
            status_message: documents.status_message,
            error_code: documents.error_code,
          }).from(documents).where(eq(documents.id, docId));

          if (!doc) {
            sendEvent({ status: 'failed', error_code: 'NOT_FOUND', status_message: 'Document not found' });
            if (!isClosed) { isClosed = true; controller.close(); }
            return false; // stop polling
          }

          sendEvent(doc);

          if (doc.status === 'ready' || doc.status === 'failed') {
            if (!isClosed) { isClosed = true; controller.close(); }
            return false; // stop polling
          }
          return true; // continue polling
        } catch (e) {
          console.error('SSE poll error:', e);
          if (!isClosed) { isClosed = true; controller.close(); }
          return false;
        }
      };

      // Poll every 1.5s until done or client disconnects
      const run = async () => {
        const shouldContinue = await poll();
        if (shouldContinue && !isClosed) {
          setTimeout(run, 1500);
        }
      };

      req.signal.addEventListener('abort', () => {
        isClosed = true;
      });

      await run();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
