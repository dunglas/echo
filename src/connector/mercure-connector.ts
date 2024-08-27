import { Channel, PresenceChannel } from "../channel";
import { MercureChannel } from "../channel/mercure-channel";
import { Connector } from "./connector";

/**
 * This class creates a connnector to a Mercure hub.
 */
export class MercureConnector extends Connector {
    /**
     * All of the subscribed channels.
     */
    channels: { [key: string]: MercureChannel } = {};

    /**
     * The last received SSE id, for state reconciliation after disconnections.
     */
    private lastEventID: string = "";

    /**
     * This ID of this connection.
     */
    private id: string = "";

    /**
     * The URL of the Mercure hub.
     */
    private url: URL;

    /**
     * The underlying EventSource.
     */
    private eventSource: EventSource | null = null;

    constructor(options: any) {
        options.url ??= `${window.origin}/.well-known/mercure`;

        super(options);

        /*if (typeof self.crypto.randomUUID !== 'function') {
            this.id = Date.now().toString(36) + Math.random().toString(36).substring(2, 12).padStart(12, "0");

            console.warn("Crypto's randomUUID() is not available, be sure to use an HTTPS connection and a modern browser.");

            return;
        }

        this.id = self.crypto.randomUUID();*/
        this.url = new URL(options.url);
    }

    /**
     * Create a fresh Mercure connection.
     */
    connect(): void {
        // The EventSource is created only when needed.
    }

    /**
     * Get a channel instance by name.
     */
    channel(channel: string): Channel {
        let c = this.channels[channel];
        if (!c) {
            c = new MercureChannel();
            this.channels[channel] = c;
            this.refreshConnection();
        }

        return c;
    }

    /**
     * Get a private channel instance by name.
     */
    privateChannel(channel: string): Channel {
        throw new Error("Method not implemented.");
    }

    /**
     * Get a presence channel instance by name.
     */
    presenceChannel(channel: string): PresenceChannel {
        throw new Error("Method not implemented.");
    }

    /**
     * Leave the given channel, as well as its private and presence variants.
     */
    leave(name: string): void {
        [
            name,
            `private-${name}`,
            `private-encrypted-${name}`,
            `presence-${name}`,
        ].forEach((channel) => {
            delete this.channels[channel];
        });
        this.refreshConnection();
    }

    /**
     * Leave the given channel.
     */
    leaveChannel(channel: string): void {
        delete this.channels[channel];
        this.refreshConnection();
    }

    /**
     * Get the socket ID for the connection.
     */
    socketId(): string {
        return this.id;
    }

    /**
     * Disconnect Mercure connection.
     */
    disconnect(): void {
        this.channels = {};
        this.lastEventID = "";
        this.refreshConnection();
    }

    refreshConnection() {
        this.url.search = "";
        for (const channel in this.channels)
            this.url.searchParams.append("topic", channel);
        this.lastEventID !== "" &&
            this.url.searchParams.set("lastEventID", this.lastEventID);

        this.eventSource?.close();

        const channelNames = Object.keys(this.channels);
        if (channelNames.length === 0) {
            this.eventSource = null;

            return;
        }

        (async () => {
            const resp = await fetch(this.options.authEndpoint, {
                method: "POST",
                credentials: "include",
                body: JSON.stringify({ channel_names: channelNames, socket_id: this.id }),
                headers: { "Content-Type": "application/json" },
            });
            if (resp.status !== 200) {
                console.error("failed to authenticate");

                return;
            }

            const json = await resp.json();
            this.id = json.socket_id;
            console.log(json);

            // we only support cookie-based auth for now
            // in the future, we may add support for the Authorization header,
            // this will require supporting the EventSource polyfill in addition to the native class
            this.eventSource = new EventSource(this.url.toString(), {
                withCredentials: true,
            });
            this.eventSource.onmessage = (e) => {
                this.lastEventID = e.lastEventId;

                console.log(e);

                try {
                    const message = JSON.parse(e.data);

                    if (typeof message.channels !== "object") {
                        console.error(
                            `JSON payload doesn't contain a valid "channels" property`
                        );

                        return;
                    }

                    if (typeof message.event !== "string") {
                        console.error(
                            `JSON payload doesn't contain a valid "event" property`
                        );

                        return;
                    }

                    if (typeof message.payload !== "object") {
                        console.error(
                            `JSON payload doesn't contain a valid "payload" property`
                        );

                        return;
                    }

                    const channels: string[] = message.channels;
                    channels.forEach((name) => {
                        const channel = this.channels[name];
                        if (!channel) return;

                        const callback = channel.events.get(message.event);
                        callback && callback(message.payload);
                    });
                } catch (e) {
                    console.error("received invalid JSON");
                }
            };

            this.eventSource.onopen = (e) => {
                for (const c in this.channels) {
                    this.channels[c].subscribedCallback &&
                        this.channels[c].subscribedCallback(e);
                }
            };

            // On error, always try to re-authicate then reconnect
            this.eventSource.onerror = (e) => {
                for (const c in this.channels) {
                    this.channels[c].errorCallback &&
                        this.channels[c].errorCallback(e);
                }

                this.eventSource?.close();
                // TODO: throttle https://stackoverflow.com/a/54385402/1352334
                this.refreshConnection();
            };
        })();
    }
}
