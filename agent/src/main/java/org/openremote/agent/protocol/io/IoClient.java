/*
 * Copyright 2017, OpenRemote Inc.
 *
 * See the CONTRIBUTORS.txt file in the distribution for a
 * full listing of individual contributors.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
package org.openremote.agent.protocol.io;

import io.netty.channel.ChannelHandler;
import io.netty.channel.ChannelInboundHandler;
import io.netty.channel.ChannelOutboundHandler;
import org.openremote.model.asset.agent.ConnectionStatus;

import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * Represents an IO client that communicates with a server; this is heavily tied to netty and uses the concept of
 * {@link io.netty.channel.ChannelHandler}s for encoding/decoding messages of type &lt;T&gt.
 *
 * @param <T> Defines the message type that the instance will encode/decode
 */
public interface IoClient<T> {

    /**
     * Send a message over the wire
     */
    void sendMessage(T message);

    /**
     * Add a consumer of received messages
     */
    void addMessageConsumer(Consumer<T> messageConsumer);

    /**
     * Remove a consumer of received messages
     */
    void removeMessageConsumer(Consumer<T> messageConsumer);

    /**
     * Remove every consumer of received messages
     */
    void removeAllMessageConsumers();

    /**
     * Add a consumer of connection status
     */
    void addConnectionStatusConsumer(Consumer<ConnectionStatus> connectionStatusConsumer);

    /**
     * Remove a consumer of connection status
     */
    void removeConnectionStatusConsumer(Consumer<ConnectionStatus> connectionStatusConsumer);

    /**
     * Remove every consumer of connection status
     */
    void removeAllConnectionStatusConsumers();

    /**
     * Get current connection status
     */
    ConnectionStatus getConnectionStatus();

    /**
     * Connect to the device
     */
    void connect();

    /**
     * Disconnect from the device
     */
    void disconnect();

    /**
     * Should return a URI that uniquely identifies this client instance
     */
    String getClientUri();

    /**
     * Allows appropriate encoders and decoders to be added to the message pipeline; if an {@link IoClient} doesn't
     * support this then an {@link UnsupportedOperationException} will be thrown, consult the {@link IoClient}'s documentation.
     */
    void setEncoderDecoderProvider(Supplier<ChannelHandler[]> encoderDecoderProvider) throws UnsupportedOperationException;
}
