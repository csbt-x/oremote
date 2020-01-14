package org.openremote.agent.protocol.artnet;


import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.netty.buffer.ByteBuf;
import io.netty.util.CharsetUtil;
import jdk.nashorn.internal.parser.JSONParser;
import org.openremote.agent.protocol.Protocol;
import org.openremote.agent.protocol.io.IoClient;
import org.openremote.agent.protocol.udp.AbstractUdpClient;
import org.openremote.agent.protocol.udp.AbstractUdpClientProtocol;
import org.openremote.model.asset.AssetAttribute;
import org.openremote.model.attribute.*;
import org.openremote.model.syslog.SyslogCategory;
import org.openremote.model.util.TextUtil;
import org.openremote.model.value.*;

import java.io.IOException;
import java.nio.charset.Charset;
import java.util.*;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.logging.Logger;
import java.util.stream.Collectors;

import static org.openremote.model.Constants.PROTOCOL_NAMESPACE;
import static org.openremote.model.attribute.MetaItemDescriptor.Access.ACCESS_PRIVATE;
import static org.openremote.model.attribute.MetaItemDescriptorImpl.*;
import static org.openremote.model.syslog.SyslogCategory.PROTOCOL;
import static org.openremote.model.util.TextUtil.REGEXP_PATTERN_STRING_NON_EMPTY;

public class ArtnetClientProtocol extends AbstractUdpClientProtocol<String> {

    public static final String PROTOCOL_NAME = PROTOCOL_NAMESPACE + ":artnet";
    public static final String PROTOCOL_DISPLAY_NAME = "Artnet Client";
    private static final String PROTOCOL_VERSION = "1.0";
    private static final Logger LOG = SyslogCategory.getLogger(PROTOCOL, ArtnetClientProtocol.class.getName());
    private final Map<AttributeRef, AttributeInfo> attributeInfoMap = new HashMap<>();
    private static int DEFAULT_RESPONSE_TIMEOUT_MILLIS = 3000;
    private static int DEFAULT_SEND_RETRIES = 1;
    private static int MIN_POLLING_MILLIS = 1000;
    public static final MetaItemDescriptor META_ARTNET_LIGHT_ID = metaItemInteger(
        "lightId",
            ACCESS_PRIVATE,
            true,
            0,
            Integer.MAX_VALUE
    );
    public static final MetaItemDescriptor META_ARTNET_CONFIGURATION = metaItemObject(
            PROTOCOL_NAME + ":areaConfiguration",
            ACCESS_PRIVATE,
            true,
            Values.createObject().putAll(new HashMap<String, Value>() {{
                put("lights", Values.createArray().add(Values.createObject().putAll(new HashMap<String, Value>() {{
                    put("id", Values.create(0));
                    put("universe", Values.create(0));
                    put("amountOfLeds", Values.create(3));
                }})));
            }})
    );


    private HashMap<Integer, ArtnetLight> artnetLightStates = new HashMap<Integer, ArtnetLight>();

    public static final List<MetaItemDescriptor> ATTRIBUTE_META_ITEM_DESCRIPTORS = Arrays.asList(
            META_ATTRIBUTE_WRITE_VALUE,
            META_POLLING_MILLIS,
            META_RESPONSE_TIMEOUT_MILLIS,
            META_SEND_RETRIES,
            META_ARTNET_CONFIGURATION
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
                //INPUT IS A TOGGLE SWITCH FOR THE LAMP (BOOLEAN)
                if(Boolean.parseBoolean(message)) {
                    //LAMP SHOULD BE TOGGLED ON/OFF
                    //artnetLightStates.get(0) //get colours of lamp

                }
                //INPUT IS A LIST OF COLOUR-VALUES (JSONObject)
                else if(Values.parseOrNull(message) != null) {
                    //LAMP VALUES SHOULD BE CHANGED (R,G,B,W)
                }
                //INPUT IS THE DIM VALUE (NUMBER)
                else if(Integer.parseInt(message) >= 0) {
                    //LAMP DIM SHOULD BE CHANGED
                }

                //Receive Values (Id of the lamp and values to be sent (Maybe also Dim and On/Off values))

                //Reading configuration

                //Load states of all other lamps
                ArrayList<ArtNetDMXLight> lights = new ArrayList<>();
                lights.add(new ArtNetDMXLight(100,0,3,0,255,255,255,255));
                lights.add(new ArtNetDMXLight(5,0,3,0,255,255,255,255));
                lights.add(new ArtNetDMXLight(3,1,3,0,255,255,255,255));

                //Build packet
                ArtNetPacket artNetPacket = ArtNetPacket.fromValue(Values.parse(message).get()).get();
                artNetPacket.assemblePacket(buf, lights);

                //Send packet (Look over it)

                Value msg = null;
                try{
                    msg = Values.parse(message).get();
                    ArtNetPacket packet = ArtNetPacket.fromValue(msg).get();
                    ByteBuf output = packet.toBuffer(buf);
                    finalEncoder.accept(message, output);
                }catch(IllegalArgumentException ex) {
                    ex.printStackTrace();
                }
            }
        };
    }

    //Runs if a new Asset is created with an ArtNet Client as attribute.
    @Override
    protected void doLinkProtocolConfiguration(AssetAttribute protocolConfiguration) {
        super.doLinkProtocolConfiguration(protocolConfiguration);

    }

    //Runs if an Asset is deleted with an ArtNet Client as attribute.
    @Override
    protected void doUnlinkProtocolConfiguration(AssetAttribute protocolConfiguration) {
        super.doUnlinkProtocolConfiguration(protocolConfiguration);


    }

    //Runs if an Attribute with an Agent protocol link is being linked to this ArtNet Network
    @Override
    protected void doLinkAttribute(AssetAttribute attribute, AssetAttribute protocolConfiguration) throws IOException {
        //TODO CHECK IF LIGHT ID IS RETRIEVED SUCCESSFULLY
        //int lightId = protocolConfiguration.getMetaItem(META_ARTNET_CONFIGURATION.getUrn()).get().getValueAsInteger().get();
        //int lightId = 0;
        MetaItem metaItem = protocolConfiguration.getMetaItem(META_ARTNET_CONFIGURATION.getUrn()).orElse(null);



        String configJsonString = metaItem.getValue().orElse(null).toJson();
        JsonObject configJson = new JsonParser().parse(configJsonString).getAsJsonObject();
        JsonArray jerry = configJson.getAsJsonArray("lights");

        for(JsonElement l : jerry)
        {
            JsonObject light = l.getAsJsonObject();
            int id = light.get("id").getAsInt();

            artnetLightStates.put(id, new ArtnetLight(0, 0, 0, 0, 0));
        }

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

        Consumer<Value> sendConsumer = null;
        ScheduledFuture pollingTask = null;
        AttributeInfo info = new AttributeInfo(attribute.getReferenceOrThrow(), sendRetries, responseTimeoutMillis);

        if (!attribute.isReadOnly()) {
            sendConsumer = Protocol.createDynamicAttributeWriteConsumer(attribute, str ->
                    clientAndQueue.send(
                            str,
                            responseStr -> {
                                // TODO: Add discovery
                                // Just drop the response; something in the future could be used to verify send was successful
                            },
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
        int lightId = protocolConfiguration.getMetaItem(META_ARTNET_CONFIGURATION.getUrn()).get().getValueAsInteger().get();
        artnetLightStates.remove(lightId);
    }

    @Override
    protected void processLinkedAttributeWrite(AttributeEvent event, AssetAttribute protocolConfiguration) {
        protocolConfiguration.getType();
        AttributeRef reference = event.getAttributeRef();
        Attribute attr =  getLinkedAttribute(reference);
        MetaItem metaItem = attr.getMetaItem("lightId").orElse(null);
        int lampId = metaItem.getValueAsInteger().orElse(-1);
        //TODO NOW IT ONLY CHANGES IN MEMORY STATE, TODO SEND PROTOCOL
        //DIM ATTRIBUTE
        if(attr.getType().get().getValueType() == ValueType.NUMBER)
            if(attr.getName().get().equalsIgnoreCase("Dim")) {
                String val = event.getAttributeState().getValue().get().toString();
                int dimValue = (int) Math.floor((double)Double.parseDouble(val));
                artnetLightStates.get(lampId).dim = dimValue;
            }
        //VALUES ATTRIBUTE
        if(attr.getType().get().getValueType() == ValueType.OBJECT)
            if(attr.getName().get().equalsIgnoreCase("Values")) {
                Value brouh = event.getAttributeState().getValue().orElse(null);
                JsonObject jobject = new JsonParser().parse(brouh.toJson()).getAsJsonObject();
                int r = jobject.get("r").getAsInt();
                int g = jobject.get("g").getAsInt();
                int b = jobject.get("b").getAsInt();
                int w = jobject.get("w").getAsInt();
                artnetLightStates.get(lampId).r = r;
                artnetLightStates.get(lampId).r = g;
                artnetLightStates.get(lampId).r = b;
                artnetLightStates.get(lampId).r = w;
            }
        //SWITCH ATTRIBUTE
        if(attr.getType().get().getValueType() == ValueType.BOOLEAN)
            if(attr.getName().get().equalsIgnoreCase("Switch")) {
                String val = event.getAttributeState().getValue().get().toString();
                boolean switchState = (boolean) Boolean.parseBoolean(val);
                if(switchState) {
                    //TODO SEND PROTOCOL TO TURN ON LIGHTS, DO NOT UPDATE LOCAL MEMORY TO KEEP COLOURS
                }else{
                    //TODO SEND PROTOCOL TO TURN OFF LIGHTS, DO NOT UPDATE LOCAL MEMORY TO KEEP COLOURS
                }
            }

        AttributeInfo info = attributeInfoMap.get(event.getAttributeRef());
        if (info == null || info.sendConsumer == null) {
            LOG.info("Request to write unlinked attribute or attribute that doesn't support writes so ignoring: " + event);
            return;
        }

        //TODO CHANGE VALUE TO NEW OBJECT -> ArtnetXObject containing light id, universe id and Value (event.getvalue)
        Value value = event.getValue().orElse(null);
        info.sendConsumer.accept(value);

        updateLinkedAttribute(event.getAttributeState());
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



    public class ArtnetLight {

        private int r, g, b, w;
        private double dim;

        public ArtnetLight(int r, int g, int b, int w, double dim) {
            this.r = r;
            this.g = g;
            this.b = b;
            this.w = w;
            this.dim = dim;
        }
    }

    public class ArtnetLightMetaData {

        public int id;
        public int universe;
        public int amountOfLeds;

        public ArtnetLightMetaData(int id, int universe, int amountOfLeds) {
            this.id = id;
            this.universe = universe;
            this.amountOfLeds = amountOfLeds;
        }
    }

}
