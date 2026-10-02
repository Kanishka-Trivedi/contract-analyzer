import OpenAI from 'openai';

export type LLMToolCall = {
  index: number;
  id?: string;
  name?: string;
  arguments?: string;
  extra_content?: unknown;
  [key: string]: unknown;
};

export type LLMDelta = {
  content?: string;
  toolCalls?: LLMToolCall[];
  finishReason?: string | null;
};

export type LLMMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string }; extra_content?: unknown; [key: string]: unknown }>;
};

const MAX_ATTEMPTS = 3;

function config() {
  const apiKey = process.env.LLM_API_KEY;
  const baseURL = process.env.LLM_BASE_URL;
  const model = process.env.LLM_MODEL;
  if (!apiKey || !baseURL || !model) {
    throw new Error('LLM configuration is missing. Set LLM_API_KEY, LLM_BASE_URL, and LLM_MODEL.');
  }
  return { apiKey, baseURL, model };
}

function isRetryable(error: unknown) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status?: number }).status)
    : 0;
  return status === 429 || status >= 500;
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

async function withRetry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) {
        if (isRetryable(error)) throw new Error('The AI provider is rate-limited, try again in a minute');
        throw error;
      }
      await sleep(250 * 2 ** attempt, signal);
    }
  }
  throw new Error('The AI provider is rate-limited, try again in a minute');
}

let mockCall = 0;

async function* mockStream(): AsyncGenerator<LLMDelta> {
  mockCall += 1;
  if (mockCall % 3 === 1) {
    const args = JSON.stringify({ doc_id: '1', query: 'force majeure', top_k: 4 });
    yield { toolCalls: [{ index: 0, id: 'mock-search', name: 'search_document', arguments: args.slice(0, 18) }] };
    yield { toolCalls: [{ index: 0, arguments: args.slice(18) }] };
    return;
  }
  if (mockCall % 3 === 2) {
    const args = JSON.stringify({ doc_id: '1', unexpected: true });
    yield { toolCalls: [{ index: 0, id: 'mock-invalid', name: 'invented_tool', arguments: args }] };
    return;
  }
  yield { content: 'I found the relevant provision. ' };
  yield { content: '<quote doc="1">The parties agree to comply with this Agreement.</quote>' };
}

export function resetMockCalls() {
  mockCall = 0;
}

export async function* streamChatCompletion(
  messages: LLMMessage[],
  tools: unknown[],
  signal?: AbortSignal,
): AsyncGenerator<LLMDelta> {
  if (process.env.LLM_MOCK === 'empty') {
    yield { content: '' };
    return;
  }
  if (process.env.LLM_MOCK === 'parallel') {
    mockCall += 1;
    if (mockCall > 1) { yield { content: 'done' }; return; }
    yield { toolCalls: [{ index: 0, id: 'call_1', name: 'search_document', arguments: '{"doc_id"' }] };
    yield { toolCalls: [{ index: 0, arguments: ':44,"query":"test"}' }] };
    yield { toolCalls: [{ index: 0, id: 'call_2', name: 'search_document', arguments: '{"doc_id"' }] };
    yield { toolCalls: [{ index: 0, arguments: ':43,"query":"test"}' }] };
    return;
  }
  if (process.env.LLM_MOCK === 'concat') {
    mockCall += 1;
    if (mockCall > 1) { yield { content: 'done' }; return; }
    yield { toolCalls: [{ index: 0, id: 'call_1', name: 'search_document', arguments: '{"doc_id":44,"query":"test"}{"doc_id":43,"query":"test"}' }] };
    return;
  }
  if (process.env.LLM_MOCK === 'garbage') {
    mockCall += 1;
    if (mockCall > 1) { yield { content: 'done' }; return; }
    yield { toolCalls: [{ index: 0, id: 'call_1', name: 'search_document', arguments: '{"doc_id":44, garbage' }] };
    return;
  }
  if (process.env.LLM_MOCK === '1') {
    yield* mockStream();
    return;
  }

  const { apiKey, baseURL, model } = config();
  const client = new OpenAI({ apiKey, baseURL });
  const stream = await withRetry(() => client.chat.completions.create({
    model,
    messages: messages as never,
    tools: tools as never,
    tool_choice: 'auto',
    stream: true,
    temperature: 0,
  }, { signal }), signal);

  const currentKeyForIndex = new Map<number, string>();
  const nameCounts = new Map<number, number>();
  const indexMap = new Map<string, number>();
  let nextOutIndex = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    const calls = delta?.tool_calls?.map((call) => {
      const rawCall = call as unknown as Record<string, unknown> & {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      };
      let key = currentKeyForIndex.get(rawCall.index);
      if (rawCall.id) {
        key = `id:${rawCall.id}`;
        currentKeyForIndex.set(rawCall.index, key);
      } else if (rawCall.function?.name) {
        const count = (nameCounts.get(rawCall.index) || 0) + 1;
        nameCounts.set(rawCall.index, count);
        key = `idx:${rawCall.index}-name:${count}`;
        currentKeyForIndex.set(rawCall.index, key);
      } else if (!key) {
        key = `idx:${rawCall.index}-name:0`;
        currentKeyForIndex.set(rawCall.index, key);
      }

      if (!indexMap.has(key)) {
        indexMap.set(key, nextOutIndex++);
      }
      const outIndex = indexMap.get(key)!;

      const otherFields: Record<string, unknown> = { ...rawCall };
      delete otherFields.function;
      delete otherFields.index;
      delete otherFields.id;
      return {
        ...otherFields,
        index: outIndex,
        id: rawCall.id,
        name: rawCall.function?.name,
        arguments: rawCall.function?.arguments,
      };
    });
    
    let textContent = '';
    if (typeof delta?.content === 'string') {
      textContent = delta.content;
    } else if (Array.isArray(delta?.content)) {
      textContent = (delta.content as any[]).map((p) => p.text || '').join('');
    }

    yield {
      content: textContent || undefined,
      toolCalls: calls && calls.length > 0 ? calls : undefined,
      finishReason: chunk.choices[0]?.finish_reason,
    };
  }
}