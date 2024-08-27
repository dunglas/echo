import { Channel } from './channel';

/**
 * This class represents a Mercure channel.
 */
export class MercureChannel extends Channel {
    events: Map<string, Function> = new Map();
    subscribedCallback: Function;
    errorCallback: Function;

    /**
     * Listen for an event on the channel instance.
     */
    listen(event: string, callback: Function): Channel {
        this.events.set(event, callback);

        return this;
    }

    /**
     * Stop listening for an event on the channel instance.
     */
    stopListening(event: string, callback?: Function): Channel {
        this.events.delete(event);
        callback && callback();

        return this;
    }

    /**
     * Register a callback to be called anytime a subscription succeeds.
     */
    subscribed(callback: Function): Channel {
        this.subscribedCallback = callback;

        return this;
    }

    /**
     * Register a callback to be called anytime an error occurs.
     */
    error(callback: Function): Channel {
        this.errorCallback = callback;

        return this;
    }
}

