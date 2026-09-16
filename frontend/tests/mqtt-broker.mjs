// Test fixture only. Deployment uses the supplied Mosquitto configuration.
import { Aedes } from "aedes";
import net from "node:net";
const broker = await Aedes.createBroker();
const server = net.createServer(broker.handle);
server.listen(Number(process.argv[2] || 18884), "127.0.0.1", () =>
  console.log("MQTT test fixture ready"),
);
process.on("SIGTERM", () => {
  server.close();
  broker.close();
});
