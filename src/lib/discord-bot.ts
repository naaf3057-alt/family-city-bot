import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  type TextChannel,
  type GuildMember,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";
import { logger } from "./logger";
import { setupTicketCategories, registerTicketEvents, sendTicketPanel, sendPointsPanel } from "./ticket-system";

const token = process.env["DISCORD_BOT_TOKEN"];
const logChannelId = process.env["DISCORD_LOG_CHANNEL_ID"];
const adminRoleId = process.env["DISCORD_ADMIN_ROLE_ID"];
const guildId = process.env["DISCORD_GUILD_ID"];

if (!token) throw new Error("DISCORD_BOT_TOKEN is required");
if (!logChannelId) throw new Error("DISCORD_LOG_CHANNEL_ID is required");
if (!adminRoleId) throw new Error("DISCORD_ADMIN_ROLE_ID is required");
if (!guildId) throw new Error("DISCORD_GUILD_ID is required");

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("setup-panel")
    .setDescription("أرسل لوحة التقديم للإدارة في هذه القناة")
    .setDefaultMemberPermissions("8")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("setup-ticket")
    .setDescription("أرسل لوحة التذاكر في هذه القناة")
    .setDefaultMemberPermissions("8")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("setup-points")
    .setDescription("أرسل لوحة النقاط في هذه القناة")
    .setDefaultMemberPermissions("8")
    .toJSON(),
];

registerTicketEvents();

client.once(Events.ClientReady, async (c) => {
  logger.info({ tag: c.user.tag }, "Discord bot is ready");

  const rest = new REST().setToken(token!);
  try {
    await rest.put(Routes.applicationGuildCommands(c.user.id, guildId!), {
      body: commands,
    });
    logger.info("Slash commands registered");
  } catch (err) {
    logger.error({ err }, "Failed to register slash commands");
  }

  try {
    const guild = await client.guilds.fetch(guildId!);
    await setupTicketCategories(guild);
  } catch (err) {
    logger.error({ err }, "Failed to setup ticket categories");
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "setup-panel") {
    await handleSetupPanel(interaction as ChatInputCommandInteraction);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "setup-ticket") {
    await sendTicketPanel(interaction as ChatInputCommandInteraction);
    return;
  }

  if (interaction.isChatInputCommand() && interaction.commandName === "setup-points") {
    await sendPointsPanel(interaction as ChatInputCommandInteraction);
    return;
  }

  if (interaction.isButton() && interaction.customId === "open_application_form") {
    await handleApplicationButton(interaction as ButtonInteraction);
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === "application_modal") {
    await handleApplicationSubmit(interaction as ModalSubmitInteraction);
    return;
  }

  if (interaction.isButton()) {
    const { customId } = interaction;
    if (customId.startsWith("accept_") || customId.startsWith("reject_")) {
      await handleDecision(interaction as ButtonInteraction);
    }
  }
});

async function handleSetupPanel(interaction: ChatInputCommandInteraction) {
  const embed = new EmbedBuilder()
    .setTitle("🛡️ تقديم طلب إدارة")
    .setDescription(
      "تقديم ادارة Family City\n\n" +
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

  await interaction.reply({ content: "✅ تم إرسال اللوحة!", ephemeral: true });
  await (interaction.channel as TextChannel).send({ embeds: [embed], components: [row] });
  logger.info({ channelId: interaction.channelId }, "Application panel sent via slash command");
}

async function handleApplicationButton(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId("application_modal")
    .setTitle("📋 تقديم طلب إدارة");

  const nameInput = new TextInputBuilder()
    .setCustomId("name")
    .setLabel("الاسم")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("اكتب اسمك هنا...")
    .setRequired(true)
    .setMaxLength(50);

  const ageInput = new TextInputBuilder()
    .setCustomId("age")
    .setLabel("العمر")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("كم عمرك؟")
    .setRequired(true)
    .setMaxLength(3);

  const experienceInput = new TextInputBuilder()
    .setCustomId("experience")
    .setLabel("خبراتك")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("اذكر خبراتك...")
    .setRequired(true)
    .setMaxLength(500);

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("سبب التقديم")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("لماذا تريد الانضمام للإدارة؟")
    .setRequired(true)
    .setMaxLength(500);

  const prevAdminInput = new TextInputBuilder()
    .setCustomId("prev_admin")
    .setLabel("كنت اداري في سيرفر اخر")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("نعم / لا (وإن كان نعم اذكر اسم السيرفر)")
    .setRequired(true)
    .setMaxLength(200);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(nameInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(ageInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(experienceInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(prevAdminInput),
  );

  await interaction.showModal(modal);
}

async function handleApplicationSubmit(interaction: ModalSubmitInteraction) {
  const name = interaction.fields.getTextInputValue("name");
  const age = interaction.fields.getTextInputValue("age");
  const experience = interaction.fields.getTextInputValue("experience");
  const reason = interaction.fields.getTextInputValue("reason");
  const prevAdmin = interaction.fields.getTextInputValue("prev_admin");

  const embed = new EmbedBuilder()
    .setTitle("📩 طلب تقديم إدارة جديد")
    .setColor(0x5865f2)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: "الاسم", value: name, inline: true },
      { name: "العمر", value: age, inline: true },
      { name: "المعرّف", value: `<@${interaction.user.id}>`, inline: true },
      { name: "خبراتك", value: experience },
      { name: "سبب التقديم", value: reason },
      { name: "كنت اداري في سيرفر اخر", value: prevAdmin },
    )
    .setFooter({ text: `ID: ${interaction.user.id}` })
    .setTimestamp();

  const acceptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`accept_${interaction.user.id}`)
      .setLabel("✅ قبول")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`reject_${interaction.user.id}`)
      .setLabel("❌ رفض")
      .setStyle(ButtonStyle.Danger),
  );

  const logChannel = await client.channels.fetch(logChannelId!) as TextChannel;
  await logChannel.send({ embeds: [embed], components: [acceptRow] });

  await interaction.reply({
    content: "✅ تم إرسال طلبك بنجاح! سيتم مراجعته من قِبَل الإدارة.",
    ephemeral: true,
  });

  logger.info({ userId: interaction.user.id, name }, "New admin application submitted");
}

async function handleDecision(interaction: ButtonInteraction) {
  const { customId } = interaction;
  const isAccept = customId.startsWith("accept_");
  const targetUserId = customId.replace(isAccept ? "accept_" : "reject_", "");

  const embed = EmbedBuilder.from(interaction.message.embeds[0]!);

  if (isAccept) {
    embed.setColor(0x57f287).setTitle("✅ تم قبول الطلب");
  } else {
    embed.setColor(0xed4245).setTitle("❌ تم رفض الطلب");
  }

  embed.addFields({
    name: isAccept ? "✅ تمت الموافقة بواسطة" : "❌ تم الرفض بواسطة",
    value: `<@${interaction.user.id}>`,
    inline: true,
  });

  await interaction.update({ embeds: [embed], components: [] });

  if (isAccept) {
    try {
      const guild = await client.guilds.fetch(guildId!);
      const member = await guild.members.fetch(targetUserId) as GuildMember;
      await member.roles.add(adminRoleId!);
      logger.info({ targetUserId, adminRoleId }, "Admin role assigned");
    } catch (err) {
      logger.warn({ err, targetUserId }, "Could not assign admin role");
    }
  } else {
    try {
      const targetUser = await client.users.fetch(targetUserId);
      await targetUser.send(
        "❌ نأسف، لم يتم قبول طلبك للانضمام إلى فريق الإدارة في الوقت الحالي.\nيمكنك المحاولة مرة أخرى لاحقاً. شكراً لاهتمامك! 🙏"
      );
    } catch (err) {
      logger.warn({ err, targetUserId }, "Could not send DM to rejected applicant");
    }
  }
}

export async function startBot() {
  await client.login(token);
}
