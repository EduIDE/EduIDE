/********************************************************************************
 * Copyright (C) 2026 EduIDE and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the MIT License, which is available in the project root.
 *
 * SPDX-License-Identifier: MIT
 ********************************************************************************/

import {
    LanguageModel,
    LanguageModelMessage,
    LanguageModelResponse,
    UserRequest,
    LanguageModelRequest,
    ImageContent,
    LanguageModelStatus,
    LanguageModelStreamResponsePart,
    ToolCallResult,
    ToolCallTextResult
} from '@theia/ai-core';
import { CancellationToken, CancellationError } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { OpenAI } from 'openai';
import { ChatCompletionStream } from 'openai/lib/ChatCompletionStream';
import { RunnableToolFunctionWithoutParse } from 'openai/lib/RunnableFunction';
import { ChatCompletionMessageParam } from 'openai/resources';

export class OpenWebUiLanguageModel implements LanguageModel {
    readonly name?: string;
    readonly vendor?: string;
    readonly version?: string;
    readonly family?: string;
    readonly maxInputTokens?: number;
    readonly maxOutputTokens?: number;

    constructor(
        public readonly id: string,
        public model: string,
        public status: LanguageModelStatus,
        public enableStreaming: boolean,
        public baseUrl: string,
        protected readonly refreshSession?: () => Promise<void>
    ) {
        this.name = model;
        this.vendor = 'Open WebUI';
    }

    async request(request: UserRequest, cancellationToken?: CancellationToken): Promise<LanguageModelResponse> {
        return this.doRequest(request, cancellationToken, true);
    }

    protected async doRequest(
        request: UserRequest,
        cancellationToken?: CancellationToken,
        allowRetry = true
    ): Promise<LanguageModelResponse> {
        const openai = this.initializeOpenAi();
        const settings = request.settings ?? {};

        if (cancellationToken?.isCancellationRequested) {
            return { text: '' };
        }

        const messages = this.processMessages(request.messages);
        const tools = this.createTools(request);

        const isNonStreaming = !this.enableStreaming || (typeof settings.stream === 'boolean' && !settings.stream);

        if (isNonStreaming) {
            try {
                const response = await openai.chat.completions.create({
                    model: this.model,
                    messages,
                    ...settings
                });
                return {
                    text: response.choices[0]?.message?.content ?? ''
                };
            } catch (error: any) {
                if (allowRetry && this.isUnauthorizedError(error) && this.refreshSession) {
                    console.warn('[OpenWebUI] 401 Unauthorized detected during non-streaming request. Refreshing session and retrying...');
                    await this.refreshSession();
                    return this.doRequest(request, cancellationToken, false);
                }
                throw error;
            }
        }

        let runner: ChatCompletionStream;
        try {
            if (tools && tools.length > 0) {
                runner = openai.beta.chat.completions.runTools({
                    model: this.model,
                    messages,
                    stream: true,
                    tools,
                    tool_choice: 'auto',
                    ...settings
                });
            } else {
                runner = openai.beta.chat.completions.stream({
                    model: this.model,
                    messages,
                    stream: true,
                    ...settings
                });
            }
        } catch (error: any) {
            if (allowRetry && this.isUnauthorizedError(error) && this.refreshSession) {
                console.warn('[OpenWebUI] 401 Unauthorized detected during streaming initialization. Refreshing session and retrying...');
                await this.refreshSession();
                return this.doRequest(request, cancellationToken, false);
            }
            throw error;
        }

        return {
            stream: new BrowserStreamingAsyncIterator(
                runner,
                request.requestId,
                cancellationToken,
                async (err) => {
                    if (this.isUnauthorizedError(err)) {
                        console.warn('[OpenWebUI] 401 Unauthorized detected during active stream. Triggering background session refresh...');
                        if (this.refreshSession) {
                            this.refreshSession();
                        }
                    }
                }
            )
        };
    }

    protected isUnauthorizedError(error: any): boolean {
        return error?.status === 401 ||
               error?.statusCode === 401 ||
               String(error?.message || '').includes('401') ||
               String(error || '').includes('401') ||
               error?.name === 'AuthenticationError';
    }

    protected initializeOpenAi(): OpenAI {
        const cookieFetch = (url: RequestInfo, init?: RequestInit) => {
            const headers = new Headers(init?.headers);
            headers.delete('Authorization');
            return fetch(url, { ...init, headers, credentials: 'include' });
        };

        const apiBaseUrl = `${this.baseUrl.replace(/\/$/, '')}/api`;

        return new OpenAI({
            dangerouslyAllowBrowser: true,
            apiKey: 'no-key',
            baseURL: apiBaseUrl,
            fetch: cookieFetch
        });
    }

    protected createTools(request: LanguageModelRequest): RunnableToolFunctionWithoutParse[] | undefined {
        return request.tools?.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.parameters,
                function: (argsString: string) => tool.handler(argsString)
            }
        } as RunnableToolFunctionWithoutParse));
    }

    protected toOpenAiRole(message: LanguageModelMessage): 'user' | 'assistant' | 'system' {
        if (message.actor === 'system') {
            return 'system';
        } else if (message.actor === 'ai') {
            return 'assistant';
        }
        return 'user';
    }

    protected toOpenAIMessage(message: LanguageModelMessage): ChatCompletionMessageParam {
        if (LanguageModelMessage.isTextMessage(message)) {
            return {
                role: this.toOpenAiRole(message),
                content: message.text
            };
        }
        if (LanguageModelMessage.isToolUseMessage(message)) {
            return {
                role: 'assistant',
                tool_calls: [{
                    id: message.id,
                    type: 'function',
                    function: { name: message.name, arguments: JSON.stringify(message.input) }
                }]
            };
        }
        if (LanguageModelMessage.isToolResultMessage(message)) {
            return {
                role: 'tool',
                tool_call_id: message.tool_use_id,
                content: typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            };
        }
        if (LanguageModelMessage.isImageMessage(message)) {
            return {
                role: message.actor === 'ai' ? 'assistant' : 'user',
                content: [{
                    type: 'image_url',
                    image_url: {
                        url: ImageContent.isBase64(message.image)
                            ? `data:${message.image.mimeType};base64,${message.image.base64data}`
                            : message.image.url
                    }
                }]
            } as ChatCompletionMessageParam;
        }
        throw new Error(`Unknown message type: '${JSON.stringify(message)}'`);
    }

    protected processMessages(messages: LanguageModelMessage[]): ChatCompletionMessageParam[] {
        return messages
            .filter(m => m.type !== 'thinking')
            .map(m => this.toOpenAIMessage(m));
    }
}

class BrowserStreamingAsyncIterator implements AsyncIterableIterator<LanguageModelStreamResponsePart> {
    protected readonly requestQueue = new Array<Deferred<IteratorResult<LanguageModelStreamResponsePart>>>();
    protected readonly messageCache = new Array<LanguageModelStreamResponsePart>();
    protected done = false;
    protected terminalError: Error | undefined = undefined;
    protected readonly listeners: { event: string; handler: Function }[] = [];

    constructor(
        protected readonly stream: ChatCompletionStream,
        protected readonly requestId: string,
        cancellationToken?: CancellationToken,
        protected readonly onErrorCallback?: (error: any) => void
    ) {
        this.registerStreamListener('error', (error: any) => {
            console.error('Error in Open WebUI chat completion stream:', error);
            if (this.onErrorCallback) {
                this.onErrorCallback(error);
            }
            this.terminalError = error;
            this.dispose();
        });

        this.registerStreamListener('abort', () => {
            this.terminalError = new CancellationError();
            this.dispose();
        });

        this.registerStreamListener('message', (message: any) => {
            if (message.role === 'tool') {
                this.handleIncoming({
                    tool_calls: [{
                        id: message.tool_call_id,
                        finished: true,
                        result: tryParseToolResult(message.content)
                    }]
                });
            }
        });

        this.registerStreamListener('end', () => {
            this.dispose();
        });

        this.registerStreamListener('chunk', (chunk: any, snapshot: any) => {
            for (const choice of snapshot?.choices ?? []) {
                if (choice?.message && !choice.message.role) {
                    choice.message.role = 'assistant';
                }
                if (choice?.message?.tool_calls) {
                    for (const call of choice.message.tool_calls) {
                        if (call.type === undefined) {
                            call.type = 'function';
                        }
                    }
                }
            }
            if (snapshot?.choices[0]?.message && Object.keys(snapshot.choices[0].message).includes('reasoning')) {
                const reasoning = (snapshot.choices[0].message as { reasoning: string }).reasoning;
                this.handleIncoming({ thought: reasoning, signature: '' });
                delete (snapshot.choices[0].message as { reasoning?: string }).reasoning;
                return;
            }
            this.handleIncoming({ ...chunk.choices[0]?.delta as LanguageModelStreamResponsePart });
        });

        if (cancellationToken) {
            cancellationToken.onCancellationRequested(() => stream.abort());
        }
    }

    [Symbol.asyncIterator](): AsyncIterableIterator<LanguageModelStreamResponsePart> {
        return this;
    }

    async next(): Promise<IteratorResult<LanguageModelStreamResponsePart>> {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }

        if (this.messageCache.length) {
            return {
                done: false,
                value: this.messageCache.shift()!
            };
        } else if (this.terminalError) {
            throw this.terminalError;
        } else if (this.done) {
            return {
                done: true,
                value: undefined
            };
        } else {
            const toQueue = new Deferred<IteratorResult<LanguageModelStreamResponsePart>>();
            this.requestQueue.push(toQueue);
            return toQueue.promise;
        }
    }

    protected handleIncoming(message: LanguageModelStreamResponsePart): void {
        if (this.messageCache.length && this.requestQueue.length) {
            throw new Error('Assertion error: cache and queue should not both be populated.');
        }

        if (this.requestQueue.length) {
            this.requestQueue.shift()!.resolve({
                done: false,
                value: message
            });
        } else {
            this.messageCache.push(message);
        }
    }

    protected registerStreamListener(event: string, handler: Function): void {
        this.stream.on(event as any, handler as any);
        this.listeners.push({ event, handler });
    }

    protected dispose(): void {
        this.done = true;
        for (const listener of this.listeners) {
            this.stream.off(listener.event as any, listener.handler as any);
        }
        this.listeners.length = 0;

        if (this.terminalError) {
            this.requestQueue.forEach(request => request.reject(this.terminalError));
        } else {
            this.requestQueue.forEach(request => request.resolve({ done: true, value: undefined }));
        }
        this.requestQueue.length = 0;
    }
}

function tryParseToolResult(result: any): ToolCallResult {
    try {
        if (typeof result === 'string') {
            return JSON.parse(result);
        }
        if (Array.isArray(result)) {
            return {
                content: result.map<ToolCallTextResult>((part: any) => ({
                    type: 'text',
                    text: part.text
                }))
            };
        }
        return result;
    } catch (error) {
        return result;
    }
}
