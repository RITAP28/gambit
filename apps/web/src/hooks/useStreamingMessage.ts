import config from "@/infra/activeconfig";
import { useAppSelector } from "@/redux/hook";
import { useCallback, useEffect, useRef, useState } from "react";

interface StreamEvent {
    type: 'metadata' | 'chunk' | 'done' | 'error';
    userMessageId?: string;
    conversationId?: string;
    content?: string;
    messageId?: string;
    contextData?: {
        nodes: Array<{ nodeId: string, type: string, content?: string, excerpts?: string[] }>,
        connections: Array<{ sourceId: string, targetId: string, relationship?: string }>
    };
    metadata?: {
        tokensUsed?: number;
        processingTime?: number;
    };
    error?: string;
    partialContent?: string;
};

interface UseStreamingMessageOptions {
    onChunk?: (chunk: string) => void;
    onComplete?: (messageId: string, fullContent: string, contextData: StreamEvent['contextData'], metadata?: StreamEvent['metadata']) => void;
    onError?: (error: string, partialContent?: string) => void;
    onStart?: (userMessageId: string) => void;
};

export function useStreamingMessage(options: UseStreamingMessageOptions = {}) {
    const [isStreaming, setIsStreaming] = useState<boolean>(false);
    const [streamedContent, setStreamedContent] = useState<string>('');
    const [streamError, setStreamError] = useState<string | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isMountedRef = useRef<boolean>(true);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;

            // aborting any in-flight stream when the hook's consumer unmounts
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        }
    }, []);

    const accessToken = useAppSelector((state) => state.auth.user?.accessToken);

    const sendMessage = useCallback(async (content: string) => {
        setIsStreaming(true);
        setStreamedContent('');
        setStreamError(null);

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch(
                `${config.DEV_BASE_URL}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`
                    },
                    body: JSON.stringify({
                        action: 'send-message',
                        content,
                        useSemanticSearch: false,
                    }),
                    signal: abortControllerRef.current.signal
                }
            );

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const reader = response.body?.getReader();
            if (!reader) throw new Error('ReadableStream not supported');

            const decoder = new TextDecoder();
            let buffer = '';
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                // decoding chunk
                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonData = line.slice(6);
                            const event: StreamEvent = JSON.parse(jsonData);

                            switch (event.type) {
                                case 'metadata':
                                    if (event.userMessageId && options.onStart) options.onStart(event.userMessageId);
                                    break;

                                case 'chunk':
                                    if (event.content) {
                                        fullContent += event.content;
                                        setStreamedContent(fullContent);

                                        if (options.onChunk) options.onChunk(event.content);
                                    };
                                    break;

                                case 'done':
                                    setIsStreaming(false);
                                    if (event.messageId && options.onComplete) options.onComplete(event.messageId, fullContent, event.contextData, event.metadata);
                                    break;

                                case 'error': {
                                    const errorMsg = event.error || 'An unknown error occured';
                                    setStreamError(errorMsg);
                                    setIsStreaming(false);
                                    
                                    if (options.onError) options.onError(errorMsg, event.partialContent);
                                    break;
                                }
                            }
                        } catch (parseError) {
                            console.error('Error parsing SSE data: ', parseError);
                        }
                    }
                }
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
            const errorName = error instanceof Error ? error.name : '';
            
            if (errorName === 'AbortError') {
                console.log('Stream aborted');
                setStreamError('Message sending was cancelled');
            } else {
                console.error('Streaming error: ', error);
                setStreamError(errorMessage);

                if (options.onError) options.onError(errorMessage);
            }
        };

        setIsStreaming(false);
    }, [options]);

    return { sendMessage, isStreaming, streamedContent, streamError }
}