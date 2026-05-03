import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type TextChannel,
} from "discord.js";
import { client } from "./discord-bot";
import { logger } from "./logger";

export async function sendApplicationPanel(channelId: string) {
  const channel = await client.channels.fetch(channelId) as TextChannel;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ تقديم طلب إدارة")
    .setDescription(
      "هل تريد الانضمام إلى فريق إدارة السيرفر؟\n\n" +
      "اضغط على الزر أدناه لملء استمارة التقديم.\n\n" +
      "**المتطلبات:**\n" +
      "• أن تكون عضواً فعّالاً في السيرفر\n" +
      "• أن يكون عمرك 15 سنة أو أكثر\n" +
      "• أن تمتلك خبرة في إدارة السيرفرات\n" +
      "• التواجد اليومي لمدة لا تقل عن 3 ساعات"
    )
    .setColor(0x5865f2)
    .setFooter({ text: "سيتم مراجعة طلبك من قِبَل الإدارة العليا" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("open_application_form")
      .setLabel("📝 تقديم طلب")
      .setStyle(ButtonStyle.Primary),
  );

  await channel.send({ embeds: [embed], components: [row] });
  logger.info({ channelId }, "Application panel sent");
}
