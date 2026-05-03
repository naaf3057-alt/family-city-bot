import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Guild,
  type TextChannel,
} from "discord.js";
import { client } from "./discord-bot";
import { logger } from "./logger";
import { addPoints, getPoints } from "./points-store";

const TICKET_TYPES = [
  {
    value: "admin_help",
    label: "طلب مساعدة اداري",
    emoji: "🧑‍💻",
    categoryName: "🧑‍💻 | طلب مساعدة اداري",
    description: "تواصل مع الإدارة لطلب المساعدة",
    roleId: "1499839948457508964",
  },
  {
    value: "ban_appeal",
    label: "اعتراض على باند",
    emoji: "🔴",
    categoryName: "🔴 | اعتراض على باند",
    description: "اعتراض على قرار الحظر",
    roleId: "1499839970427408414",
  },
  {
    value: "store",
    label: "المتجر",
    emoji: "🛒",
    categoryName: "🛒 | المتجر",
    description: "استفسارات ومشاكل المتجر",
    roleId: "1499839978962948206",
  },
  {
    value: "admin_complaint",
    label: "شكوى على اداري",
    emoji: "🚫",
    categoryName: "🚫 | شكوى على اداري",
    description: "تقديم شكوى ضد أحد الإداريين",
    roleId: "1499839918812303412",
  },
  {
    value: "compensation",
    label: "تعويض",
    emoji: "⏳",
    categoryName: "⏳ | تعويض",
    description: "طلب تعويض",
    roleId: "1499839994959757535",
  },
  {
    value: "mod_complaint",
    label: "شكوى على رقابي",
    emoji: "👁️",
    categoryName: "👁️ | شكوى على رقابي",
    description: "تقديم شكوى ضد أحد الرقابيين",
    roleId: "1499839966958850158",
  },
];

const categoryCache = new Map<string, string>();
const claimedTickets = new Map<string, string>();

export async function setupTicketCategories(guild: Guild) {
  for (const type of TICKET_TYPES) {
    let category = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildCategory && c.name === type.categoryName
    ) as CategoryChannel | undefined;

    if (!category) {
      category = await guild.channels.create({
        name: type.categoryName,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      });
      logger.info({ categoryName: type.categoryName }, "Created ticket category");
    }

    categoryCache.set(type.value, category.id);
  }

  logger.info("All ticket categories ready");
}

export function registerTicketEvents() {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "ticket_select"
    ) {
      await handleTicketSelect(interaction as StringSelectMenuInteraction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("close_ticket_")) {
      await handleCloseTicket(interaction as ButtonInteraction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("claim_ticket_")) {
      await handleClaimTicket(interaction as ButtonInteraction);
      return;
    }

    if (interaction.isButton() && interaction.customId === "check_my_points") {
      await handleCheckPoints(interaction as ButtonInteraction);
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("transcript_ticket_")) {
      await handleTranscript(interaction as ButtonInteraction);
      return;
    }
  });
}

async function handleTicketSelect(interaction: StringSelectMenuInteraction) {
  const selected = interaction.values[0]!;
  const ticketType = TICKET_TYPES.find((t) => t.value === selected)!;
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id);

  const existing = guild.channels.cache.find(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.name === `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}`
  );

  if (existing) {
    await interaction.reply({
      content: `❌ لديك تذكرة مفتوحة بالفعل: <#${existing.id}>`,
      ephemeral: true,
    });
    return;
  }

  const categoryId = categoryCache.get(selected);
  if (!categoryId) {
    await interaction.reply({
      content: "❌ حدث خطأ، الكاتجوري غير موجود. تواصل مع الإدارة.",
      ephemeral: true,
    });
    return;
  }

  const channelName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20)}`;

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: ticketType.roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  }) as TextChannel;

  const embed = new EmbedBuilder()
    .setTitle(`${ticketType.emoji} ${ticketType.label}`)
    .setDescription(
      `مرحباً ${member}!\n\n` +
      `تم فتح تذكرتك بنجاح.\n` +
      `يرجى ذكر سبب فتح التذكرة وسيرد عليك أحد المسؤولين قريباً.\n\n` +
      `لإغلاق التذكرة اضغط على زر الإغلاق أدناه.`
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Family City | نظام التذاكر" })
    .setTimestamp();

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_ticket_${interaction.user.id}`)
      .setLabel("📥 استلام")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`close_ticket_${interaction.user.id}`)
      .setLabel("🔒 إغلاق التذكرة")
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`transcript_ticket_${interaction.user.id}`)
      .setLabel("📤 إرسال نسخة بالخاص")
      .setStyle(ButtonStyle.Secondary),
  );

  await ticketChannel.send({
    content: `${member} | <@&${ticketType.roleId}>`,
    embeds: [embed],
    components: [row1, row2],
  });

  await interaction.reply({
    content: `✅ تم فتح تذكرتك: <#${ticketChannel.id}>`,
    ephemeral: true,
  });

  logger.info({ userId: interaction.user.id, ticketType: selected }, "Ticket opened");
}

async function handleClaimTicket(interaction: ButtonInteraction) {
  const channelId = interaction.channelId;

  if (claimedTickets.has(channelId)) {
    const claimerMention = `<@${claimedTickets.get(channelId)}>`;
    await interaction.reply({
      content: `❌ هذه التذكرة تم استلامها مسبقاً من ${claimerMention}`,
      ephemeral: true,
    });
    return;
  }

  claimedTickets.set(channelId, interaction.user.id);
  const totalPoints = addPoints(interaction.user.id, 8);

  const embed = new EmbedBuilder()
    .setTitle("📥 تم الاستلام")
    .setDescription(
      `قام <@${interaction.user.id}> باستلام هذه التذكرة.\n\n` +
      `🏆 حصلت على **8 نقاط**!\n` +
      `مجموع نقاطك: **${totalPoints} نقطة**`
    )
    .setColor(0x57f287)
    .setTimestamp();

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`claim_ticket_${interaction.customId.replace("claim_ticket_", "")}`)
      .setLabel("📥 تم الاستلام")
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`close_ticket_${interaction.customId.replace("claim_ticket_", "")}`)
      .setLabel("🔒 إغلاق التذكرة")
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.update({ components: [buttons] });
  await interaction.followUp({ embeds: [embed] });

  logger.info({ userId: interaction.user.id, channelId, totalPoints }, "Ticket claimed, points awarded");
}

async function handleTranscript(interaction: ButtonInteraction) {
  const guild = interaction.guild!;
  const member = await guild.members.fetch(interaction.user.id);
  const adminRoleId = process.env["DISCORD_ADMIN_ROLE_ID"]!;

  const hasPermission =
    member.roles.cache.has(adminRoleId) ||
    TICKET_TYPES.some((t) => member.roles.cache.has(t.roleId));

  if (!hasPermission) {
    await interaction.reply({
      content: "❌ ليس لديك صلاحية لاستخدام هذا الزر.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel as TextChannel;
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();

  const lines: string[] = [
    `📋 نسخة التذكرة: #${channel.name}`,
    `📅 التاريخ: ${new Date().toLocaleString("ar-SA")}`,
    `─────────────────────────`,
  ];

  for (const msg of sorted) {
    if (msg.author.bot && msg.embeds.length > 0) {
      for (const embed of msg.embeds) {
        if (embed.title) lines.push(`[BOT] ${embed.title}`);
        if (embed.description) lines.push(embed.description.slice(0, 200));
        for (const field of embed.fields) {
          lines.push(`${field.name}: ${field.value}`);
        }
        lines.push("─────");
      }
    } else if (!msg.author.bot && msg.content) {
      const time = msg.createdAt.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
      lines.push(`[${time}] ${msg.author.username}: ${msg.content}`);
    }
  }

  const transcript = lines.join("\n");
  const chunks: string[] = [];
  for (let i = 0; i < transcript.length; i += 1900) {
    chunks.push(transcript.slice(i, i + 1900));
  }

  try {
    await interaction.user.send(`📤 **نسخة التذكرة** — \`#${channel.name}\``);
    for (const chunk of chunks) {
      await interaction.user.send(`\`\`\`\n${chunk}\n\`\`\``);
    }
    await interaction.editReply({ content: "✅ تم إرسال نسخة التذكرة إلى خاصك!" });
  } catch {
    await interaction.editReply({ content: "❌ لم أتمكن من إرسال رسالة خاصة. تأكد أن رسائلك الخاصة مفتوحة." });
  }

  logger.info({ userId: interaction.user.id, channelId: channel.id }, "Transcript sent");
}

async function handleCloseTicket(interaction: ButtonInteraction) {
  const channel = interaction.channel as TextChannel;

  claimedTickets.delete(channel.id);

  const embed = new EmbedBuilder()
    .setTitle("🔒 إغلاق التذكرة")
    .setDescription(
      `تم إغلاق التذكرة بواسطة <@${interaction.user.id}>\n` +
      `سيتم حذف القناة خلال 5 ثوانٍ...`
    )
    .setColor(0xed4245)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });

  logger.info({ channelId: channel.id }, "Ticket closed");

  setTimeout(async () => {
    try {
      await channel.delete();
    } catch (err) {
      logger.warn({ err }, "Could not delete ticket channel");
    }
  }, 5000);
}

export async function sendTicketPanel(interaction: ChatInputCommandInteraction) {
  const select = new StringSelectMenuBuilder()
    .setCustomId("ticket_select")
    .setPlaceholder("اختر نوع التذكرة...")
    .addOptions(
      TICKET_TYPES.map((t) => ({
        label: t.label,
        value: t.value,
        emoji: t.emoji,
        description: t.description,
      }))
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  const embed = new EmbedBuilder()
    .setTitle("🎫 نظام التذاكر")
    .setDescription(
      "يرجى اختيار الفئة المناسبة لفتح تذكرة.\n" +
      "عند فتح التذكرة ذكر سبب التذكرة برجى."
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Family City | نظام التذاكر" })
    .setTimestamp();

  await interaction.reply({ content: "✅ تم إرسال لوحة التذاكر!", ephemeral: true });
  await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });

  logger.info({ channelId: interaction.channelId }, "Ticket panel sent");
}

async function handleCheckPoints(interaction: ButtonInteraction) {
  const points = getPoints(interaction.user.id);

  const embed = new EmbedBuilder()
    .setTitle("🏆 نقاطك في التذاكر")
    .setDescription(
      `<@${interaction.user.id}>\n\n` +
      `مجموع نقاطك: **${points} نقطة** 🎯\n\n` +
      `تحصل على **8 نقاط** لكل تذكرة تستلمها.`
    )
    .setColor(0xfee75c)
    .setThumbnail(interaction.user.displayAvatarURL())
    .setFooter({ text: "Family City | نقاط التذاكر" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function sendPointsPanel(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🏆 نقاط التذاكر")
    .setDescription(
      "اضغط على الزر أدناه لمعرفة نقاطك في التذاكر.\n\n" +
      "📌 تحصل على **8 نقاط** لكل تذكرة تستلمها."
    )
    .setColor(0xfee75c)
    .setFooter({ text: "Family City | نقاط التذاكر" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("check_my_points")
      .setLabel("استفسار عن نقاطك في التكات")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🏆"),
  );

  await interaction.reply({ content: "✅ تم إرسال لوحة النقاط!", ephemeral: true });
  await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });

  logger.info({ channelId: interaction.channelId }, "Points panel sent");
}

export async function getStaffPoints(userId: string): Promise<number> {
  return getPoints(userId);
}
