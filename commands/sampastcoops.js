import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { fetchPastCoops } from '../services/coopService.js';
import { listSeasons } from '../services/seasonService.js';
import { chunkContent } from '../services/discord.js';

export const data = new SlashCommandBuilder()
    .setName('sampastcoops')
    .setDescription('List past coop identifiers and counts (sorted)')
    .addBooleanOption(option =>
        option.setName('push_only')
            .setDescription('Only include coops that were marked push')
            .setRequired(false)
    )
    .addStringOption(option =>
        option.setName('season')
            .setDescription('Filter by season (e.g. fall_2025)')
            .setRequired(false)
            .setAutocomplete(true)
    );

const DIGIT_EMOJI = [
    ':zero:',
    ':one:',
    ':two:',
    ':three:',
    ':four:',
    ':five:',
    ':six:',
    ':seven:',
    ':eight:',
    ':nine:'
];

function formatRows(rows) {
    const lines = rows.map(row => `${row.cnt} - ${row.coop}`);
    const totalCoops = rows.reduce((sum, row) => sum + (row.cnt || 0), 0);
    const totalChars = rows.reduce((sum, row) => sum + (row.cnt || 0) * String(row.coop).length, 0);
    return { lines, totalCoops, totalChars };
}

function processingTimeText(start) {
    const elapsedMs = Date.now() - start;
    const minutes = Math.floor(elapsedMs / 60000);
    const seconds = Math.floor((elapsedMs % 60000) / 1000);
    return `Total !!pc time: ${minutes}m ${seconds}s`;
}

function replaceAlphaNumeric(content) {
    let output = '';

    for (const char of content) {
        if (char === ' ') {
            output += ':blue_square:';
            continue;
        }

        if (char === '-') {
            output += ':no_entry:';
            continue;
        }

        if (char === '#') {
            output += ':hash:';
            continue;
        }

        const lower = char.toLowerCase();
        if (lower >= 'a' && lower <= 'z') {
            output += `:regional_indicator_${lower}:`;
            continue;
        }

        if (char >= '0' && char <= '9') {
            output += DIGIT_EMOJI[Number(char)];
            continue;
        }

        output += char;
    }

    return output;
}

function encodeMessage(content) {
    return replaceAlphaNumeric(String(content));
}

async function replyNoRows(interaction, season) {
    const seasonSuffix = season ? ' for season ' + season : '';
    await interaction.reply(withLeadingQuote(encodeMessage('No coops recorded yet' + seasonSuffix + '.')));
}

async function sendAdditionalChunks(interaction, chunks) {
    for (const chunk of chunks) {
        await interaction.followUp({ content: withLeadingQuote(chunk) });
    }
}

async function sendPagedResponse(interaction, chunks, headerContent) {
    const hasHeader = Boolean(headerContent);
    const initialContent = hasHeader ? headerContent : chunks[0];
    const remainingChunks = hasHeader ? chunks : chunks.slice(1);

    if (!initialContent) {
        return { replyMessage: null, channel: interaction.channel ?? null };
    }

    try {
        await interaction.reply({ content: withLeadingQuote(initialContent), withResponse: true });
        const replyMessage = await interaction.fetchReply().catch(() => null);
        await sendAdditionalChunks(interaction, remainingChunks);
        const channel = replyMessage?.channel ?? interaction.channel ?? null;
        return { replyMessage, channel };
    } catch (err) {
        console.warn('Failed to send pastcoops reply with response, retrying without it:', err);
        await interaction.reply(withLeadingQuote(initialContent));
        const replyMessage = await interaction.fetchReply().catch(() => null);
        await sendAdditionalChunks(interaction, remainingChunks);
        const channel = replyMessage?.channel ?? interaction.channel ?? null;
        return { replyMessage, channel };
    }
}

function buildBlameText(replyMessage) {
    if (!replyMessage?.id) {
        return 'Who to blame for this: (link not available)';
    }

    const guildPart = replyMessage.guildId ? replyMessage.guildId : '@me';
    const link = `https://discord.com/channels/${guildPart}/${replyMessage.channelId}/${replyMessage.id}`;
    return `Who to blame for this: ${link}`;
}

function isMissingAccessError(err) {
    if (!err) return false;
    const code = err.code ?? err?.rawError?.code;
    return code === 50001 || code === 50013;
}

function makeFollowUpOptions(content, isEphemeral) {
    return isEphemeral ? { content, flags: 64 } : { content };
}

function withLeadingQuote(content) {
    return String(content)
        .split('\n')
        .map(line => `> ${line}`)
        .join('\n');
}

async function sendFooter(interaction, channel, replyMessage, totalsText, charsText, start) {
    const blameText = buildBlameText(replyMessage);
    const processingText = processingTimeText(start);
    const isEphemeral = replyMessage?.flags?.has?.(MessageFlags.Ephemeral) ?? false;

    try {
        if (channel && typeof channel.send === 'function' && !isEphemeral) {
            await channel.send(withLeadingQuote(encodeMessage(`${totalsText}\n${charsText}`)));
            await channel.send(withLeadingQuote(encodeMessage(processingText)));
            await channel.send(withLeadingQuote(encodeMessage(blameText)));
            return;
        }

        await interaction.followUp(makeFollowUpOptions(withLeadingQuote(encodeMessage(`${totalsText}\n${charsText}`)), isEphemeral));
        await interaction.followUp(makeFollowUpOptions(withLeadingQuote(encodeMessage(processingText)), isEphemeral));
        await interaction.followUp(makeFollowUpOptions(withLeadingQuote(encodeMessage(blameText)), isEphemeral));
    } catch (err) {
        if (!isMissingAccessError(err)) {
            console.error('Failed to send footer messages for pastcoops:', err);
        }
        try {
            await interaction.followUp(makeFollowUpOptions(withLeadingQuote(encodeMessage(`${totalsText}\n${charsText}\n${blameText}`)), true));
        } catch (err) {
            if (!isMissingAccessError(err)) {
                console.warn('Failed to send fallback footer for pastcoops:', err);
            }
        }
    }
}

export async function execute(interaction) {
    const start = Date.now();
    const pushOnly = interaction.options.getBoolean('push_only') ?? false;
    const season = interaction.options.getString('season') || null;

    const rows = fetchPastCoops({ pushOnly, season });

    if (!rows || rows.length === 0) {
        await replyNoRows(interaction, season);
        return;
    }

    const { lines, totalCoops, totalChars } = formatRows(rows);
    const encodedLines = lines.map(line => encodeMessage(line));
    const chunks = chunkContent(encodedLines);
    const headerContent = encodeMessage('previous codes from Birdsnest\n# of Uses - Code');
    const { replyMessage, channel } = await sendPagedResponse(interaction, chunks, headerContent);

    const totalsText = `Total coops: ${totalCoops}`;
    const charsText = `Total characters: ${totalChars}`;

    await sendFooter(interaction, channel, replyMessage, totalsText, charsText, start);
}

export async function autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const allSeasons = listSeasons();
    const filtered = allSeasons
        .filter(season => season.toLowerCase().includes(focused))
        .slice(0, 4);
    await interaction.respond(filtered.map(season => ({ name: season, value: season })));
}

export default { data, execute, autocomplete };
