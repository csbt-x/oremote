package org.openremote.agent.protocol.artnet;

import io.netty.buffer.ByteBuf;
import io.netty.util.CharsetUtil;
import org.openremote.agent.protocol.Protocol;
import org.openremote.agent.protocol.io.IoClient;
import org.openremote.agent.protocol.udp.AbstractUdpClient;
import org.openremote.agent.protocol.udp.AbstractUdpClientProtocol;
import org.openremote.model.asset.AssetAttribute;
import org.openremote.model.attribute.*;
import org.openremote.model.syslog.SyslogCategory;
import org.openremote.model.util.TextUtil;
import org.openremote.model.value.Value;
import org.openremote.model.value.Values;

import java.nio.charset.Charset;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.logging.Logger;

import static org.openremote.model.Constants.PROTOCOL_NAMESPACE;
import static org.openremote.model.syslog.SyslogCategory.PROTOCOL;

public class ArtnetClientProtocol extends AbstractUdpClientProtocol<String> {

    private static final Logger LOG = SyslogCategory.getLogger(PROTOCOL, ArtnetClientProtocol.class.getName());
    public static final String PROTOCOL_NAME = PROTOCOL_NAMESPACE + ":artnetClient";
    public static final String PROTOCOL_DISPLAY_NAME = "Artnet Client";
    private static final String PROTOCOL_VERSION = "1.0";
    private final Map<AttributeRef, AttributeInfo> attributeInfoMap = new HashMap<>();
    private static int DEFAULT_RESPONSE_TIMEOUT_MILLIS = 3000;
    private static int DEFAULT_SEND_RETRIES = 1;
    private static boolean DEFAULT_SERVER_ALWAYS_RESPONDS = false;
    private static int MIN_POLLING_MILLIS = 1000;

    public static final List<MetaItemDescriptor> ATTRIBUTE_META_ITEM_DESCRIPTORS = Arrays.asList(
            META_ATTRIBUTE_WRITE_VALUE,
            META_POLLING_MILLIS,
            META_RESPONSE_TIMEOUT_MILLIS,
            META_SEND_RETRIES,
            META_SERVER_ALWAYS_RESPONDS
    );

    @Override
    protected IoClient<String> createIoClient(String host, int port, Integer bindPort, Charset charset, boolean binaryMode, boolean hexMode) {

        BiConsumer<ByteBuf, List<String>> decoder;
        BiConsumer<String, ByteBuf> encoder;

        if (hexMode) {
            decoder = (buf, messages) -> {
                byte[] bytes = new byte[buf.readableBytes()];
                buf.readBytes(bytes);
                String msg = Protocol.bytesToHexString(bytes);
                messages.add(msg);
            };
            encoder = (message, buf) -> {
                byte[] bytes = Protocol.bytesFromHexString(message);
                buf.writeBytes(bytes);
            };
        } else if (binaryMode) {
            decoder = (buf, messages) -> {
                byte[] bytes = new byte[buf.readableBytes()];
                buf.readBytes(bytes);
                String msg = Protocol.bytesToBinaryString(bytes);
                messages.add(msg);
            };
            encoder = (message, buf) -> {
                byte[] bytes = Protocol.bytesFromBinaryString(message);
                buf.writeBytes(bytes);
            };
        } else {
            final Charset finalCharset = charset != null ? charset : CharsetUtil.UTF_8;
            decoder = (buf, messages) -> {
                String msg = buf.toString(finalCharset);
                messages.add(msg);
                buf.readerIndex(buf.readerIndex() + buf.readableBytes());
            };
            encoder = (message, buf) -> buf.writeBytes(message.getBytes(finalCharset));
        }

        BiConsumer<ByteBuf, List<String>> finalDecoder = decoder;
        BiConsumer<String, ByteBuf> finalEncoder = encoder;


        return new AbstractUdpClient<String>(host, port, bindPort, executorService) {

            @Override
            protected void decode(ByteBuf buf, List<String> messages) {
                finalDecoder.accept(buf, messages);
            }

            @Override
            protected void encode(String message, ByteBuf buf) {
                if(!Boolean.parseBoolean(message)) {

                }
                message = message.substring(1, message.length() - 1).trim();
                String[] values = message.split(",");

                double dim = Double.parseDouble(values[4]);
                int r;
                int g;
                int b;
                int w;
                if(dim > 0) {
                    r = (int) Math.round((Double.parseDouble(values[0]) / (100 - dim)));
                    g = (int) Math.round((Double.parseDouble(values[1]) / (100 - dim)));
                    b = (int) Math.round((Double.parseDouble(values[2]) / (100 - dim)));
                    w = (int) Math.round((Double.parseDouble(values[3]) / (100 - dim)));
                }else {
                    r = 0;
                    g = 0;
                    b = 0;
                    w = 0;
                }

                byte[] prefix = { 65, 114, 116, 45, 78, 101, 116, 0, 0, 80, 0, 14 };
                buf.writeBytes(prefix);
                buf.writeByte(0);
                buf.writeByte(0);
                buf.writeByte(0);
                buf.writeByte(0);
                buf.writeByte(0);
                buf.writeByte(4);
                for(int i = 0; i <= 18; i++) {
                    buf.writeByte(g);
                    buf.writeByte(r);
                    buf.writeByte(b);
                    buf.writeByte(w);
                }
                finalEncoder.accept(message, buf);
            }
        };
    }

    @Override
    protected void doLinkAttribute(AssetAttribute attribute, AssetAttribute protocolConfiguration) {

        if (!protocolConfiguration.isEnabled()) {
            LOG.info("Protocol configuration is disabled so ignoring: " + protocolConfiguration.getReferenceOrThrow());
            return;
        }

        ClientAndQueue clientAndQueue = clientMap.get(protocolConfiguration.getReferenceOrThrow());

        if (clientAndQueue == null) {
            return;
        }

        final Integer pollingMillis = Values.getMetaItemValueOrThrow(attribute, META_POLLING_MILLIS, false, true)
                .flatMap(Values::getIntegerCoerced)
                .orElse(null);

        final int responseTimeoutMillis = Values.getMetaItemValueOrThrow(attribute, META_RESPONSE_TIMEOUT_MILLIS, false, true)
                .flatMap(Values::getIntegerCoerced)
                .orElseGet(() ->
                        Values.getMetaItemValueOrThrow(protocolConfiguration, META_RESPONSE_TIMEOUT_MILLIS, false, true)
                                .flatMap(Values::getIntegerCoerced)
                                .orElse(DEFAULT_RESPONSE_TIMEOUT_MILLIS)
                );

        final int sendRetries = Values.getMetaItemValueOrThrow(attribute, META_SEND_RETRIES, false, true)
                .flatMap(Values::getIntegerCoerced)
                .orElseGet(() ->
                        Values.getMetaItemValueOrThrow(protocolConfiguration, META_SEND_RETRIES, false, true)
                                .flatMap(Values::getIntegerCoerced)
                                .orElse(DEFAULT_SEND_RETRIES)
                );

        final boolean serverAlwaysResponds = Values.getMetaItemValueOrThrow(
                attribute,
                META_SERVER_ALWAYS_RESPONDS,
                false,
                false
        ).flatMap(Values::getBoolean).orElseGet(() ->
                Values.getMetaItemValueOrThrow(protocolConfiguration, META_SERVER_ALWAYS_RESPONDS, false, false)
                        .flatMap(Values::getBoolean)
                        .orElse(DEFAULT_SERVER_ALWAYS_RESPONDS)
        );

        Consumer<Value> sendConsumer = null;
        ScheduledFuture pollingTask = null;
        AttributeInfo info = new AttributeInfo(attribute.getReferenceOrThrow(), sendRetries, responseTimeoutMillis);

        if (!attribute.isReadOnly()) {
            sendConsumer = Protocol.createDynamicAttributeWriteConsumer(attribute, str ->
                    clientAndQueue.send(
                            str,
                            serverAlwaysResponds ? responseStr -> {
                                // Just drop the response; something in the future could be used to verify send was successful
                            } : null,
                            info));
        }

        if (pollingMillis != null && pollingMillis < MIN_POLLING_MILLIS) {
            LOG.warning("Polling ms must be >= " + MIN_POLLING_MILLIS);
            return;
        }

        final String writeValue = Values.getMetaItemValueOrThrow(attribute, META_ATTRIBUTE_WRITE_VALUE, false, true)
                .map(Object::toString).orElse(null);

        if (pollingMillis != null && TextUtil.isNullOrEmpty(writeValue)) {
            LOG.warning("Polling requires the META_ATTRIBUTE_WRITE_VALUE meta item to be set");
            return;
        }

        if (pollingMillis != null) {
            Consumer<String> responseConsumer = str -> {
                LOG.fine("Polling response received updating attribute: " + attribute.getReferenceOrThrow());
                updateLinkedAttribute(
                        new AttributeState(
                                attribute.getReferenceOrThrow(),
                                str != null ? Values.create(str) : null));
            };

            Runnable pollingRunnable = () -> clientAndQueue.send(writeValue, responseConsumer, info);
            pollingTask = schedulePollingRequest(clientAndQueue, attribute.getReferenceOrThrow(), pollingRunnable, pollingMillis);
        }

        attributeInfoMap.put(attribute.getReferenceOrThrow(), info);
        info.pollingTask = pollingTask;
        info.sendConsumer = sendConsumer;
    }

    protected ScheduledFuture schedulePollingRequest(ClientAndQueue clientAndQueue,
                                                     AttributeRef attributeRef,
                                                     Runnable pollingTask,
                                                     int pollingMillis) {

        LOG.fine("Scheduling polling request on client '" + clientAndQueue.client + "' to execute every " + pollingMillis + " ms for attribute: " + attributeRef);

        return executorService.scheduleWithFixedDelay(pollingTask, 0, pollingMillis, TimeUnit.MILLISECONDS);
    }

    @Override
    protected void doUnlinkAttribute(AssetAttribute attribute, AssetAttribute protocolConfiguration) {

    }

    @Override
    protected void processLinkedAttributeWrite(AttributeEvent event, AssetAttribute protocolConfiguration) {
        AttributeInfo info = attributeInfoMap.get(event.getAttributeRef());

        if (info == null || info.sendConsumer == null) {
            LOG.info("Request to write unlinked attribute or attribute that doesn't support writes so ignoring: " + event);
            return;
        }

        AssetAttribute attribute = getLinkedAttribute(event.getAttributeRef());
        AttributeExecuteStatus status = null;

        if (attribute.isExecutable()) {
            status = event.getValue()
                    .flatMap(Values::getString)
                    .flatMap(AttributeExecuteStatus::fromString)
                    .orElse(null);

            if (status != null && status != AttributeExecuteStatus.REQUEST_START) {
                LOG.fine("Unsupported execution status: " + status);
                return;
            }
        }

        Value value = status != null ? null : event.getValue().orElse(null);
        info.sendConsumer.accept(value);

        if (status != null) {
            updateLinkedAttribute(new AttributeState(event.getAttributeRef(), AttributeExecuteStatus.COMPLETED.asValue()));
        }
    }

    @Override
    public String getProtocolName() {
        return PROTOCOL_NAME;
    }

    @Override
    public String getProtocolDisplayName() {
        return PROTOCOL_DISPLAY_NAME;
    }

    @Override
    public String getVersion() {
        return PROTOCOL_VERSION;
    }

    @Override
    protected List<MetaItemDescriptor> getLinkedAttributeMetaItemDescriptors() {
        return ATTRIBUTE_META_ITEM_DESCRIPTORS;
    }
}
