export class WebSocketClient {
    private ws: WebSocket | null = null;
    private isConnected: boolean = false;
    private messageHandlers: Map<string, (data: { action: string; data: object }) => void>;
    private user = null;
    private reconnectAttempts: number;
    private maxReconnectAttempts: number;
    private reconnectInterval: number;

    constructor() {
        this.ws = null;
        this.isConnected = false;
        this.messageHandlers = new Map();
        this.user = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectInterval = 1000; // 1 second
    };

    connect(url: string): Promise<WebSocket> {
        return new Promise<WebSocket>((resolve, reject) => {
            try {
                this.ws = new WebSocket(url);
                this.ws.onopen = () => {
                    console.log('connected to websocket server');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    resolve(this.ws as WebSocket);
                };

                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (error) {
                        console.error('Error parsing messages: ', error);
                    };
                };

                this.ws.onerror = (error) => {
                    console.error('websocket error: ', error);
                    reject(error);
                };

                this.ws.onclose = (event) => {
                    console.log('websocket connection closed: ', event.code, event.reason);
                    this.isConnected = false;
                    this.attemptReconnect(url);
                }
            } catch (error) {
                console.error('failed to create a websocket connection: ', error);
                reject(error);
            };
        });
    };

    // auto-reconnect logic
    attemptReconnect(url: string) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            const delay = this.reconnectInterval * Math.pow(2, this.reconnectAttempts);
            console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);

            setTimeout(() => {
                this.reconnectAttempts++;
                this.connect(url).catch(() => {
                    // will try again
                });
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
            this.onMaxReconnectAttemptsReached?.();
        }
    }

    onMaxReconnectAttemptsReached() {}

    handleMessage(dta: { action: string, data: object }) {
        const handler = this.messageHandlers.get(dta.action);
        if (handler) {
            handler(dta);
        } else {
            console.log('Unhandled message type: ', dta.action, dta);
        }
    }
}