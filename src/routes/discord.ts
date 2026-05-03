import { Router, type IRouter } from "express";
import { sendApplicationPanel } from "../lib/deploy-command";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/discord/send-panel", async (req, res) => {
  const channelId = process.env["DISCORD_APPLICATION_CHANNEL_ID"];
  if (!channelId) {
    res.status(500).json({ error: "DISCORD_APPLICATION_CHANNEL_ID not set" });
    return;
  }

  try {
    await sendApplicationPanel(channelId);
    res.json({ success: true, message: "Application panel sent successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to send application panel");
    res.status(500).json({ error: "Failed to send panel" });
  }
});

export default router;
