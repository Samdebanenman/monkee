import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ButtonStyle, ComponentType, MessageFlags } from 'discord.js';
import { createInteraction, createOptions } from './helpers.js';

vi.mock('../../../utils/permissions.js', () => ({ requireMamaBird: vi.fn() }));
vi.mock('../../../services/coopService.js', () => ({ linkAltAccount: vi.fn(), unlinkAltAccount: vi.fn() }));
vi.mock('../../../services/memberService.js', () => ({
  setIgnForMember: vi.fn(), setMembersActiveStatus: vi.fn(), syncMembersFromApiEntries: vi.fn(),
  fetchMembersPayloadFromApi: vi.fn(), getInactiveMembers: vi.fn(), prepareMemberRemoval: vi.fn(), removeMembers: vi.fn(),
}));

import { data, execute } from '../../../commands/member.js';
import { requireMamaBird } from '../../../utils/permissions.js';
import { getInactiveMembers, prepareMemberRemoval, removeMembers } from '../../../services/memberService.js';

const members = [
  { internal_id: 1, discord_id: '111111111111111111', discord_name: 'First player' },
  { internal_id: 2, discord_id: '222222222222222222', discord_name: 'Second player' },
];
const text = payload => payload.components[0].toJSON().content;

function createRemovalInteraction(actions = ['confirm', 'confirm']) {
  const interaction = createInteraction({
    userId: '999999999999999999',
    options: createOptions({ subcommand: 'removeplayer',
      strings: { mention: `<@${members[0].discord_id}>, <@!${members[1].discord_id}> <@${members[0].discord_id}>` } }),
  });
  interaction.webhook = { editMessage: vi.fn(async () => {}) };
  const buttons = actions.map((action, index) => ({
    user: interaction.user,
    customId: `member:removeplayer:${index + 1}:${action}`,
    update: vi.fn(async () => {}),
  }));
  const prompts = buttons.map((button, index) => ({
    id: `prompt-${index + 1}`,
    awaitMessageComponent: vi.fn(async () => button),
  }));
  let promptIndex = 0;
  interaction.followUp.mockImplementation(async payload => {
    if (payload.components.some(component => component.toJSON().type === ComponentType.ActionRow)) {
      return prompts[promptIndex++];
    }
    return { id: 'list-page' };
  });
  return { interaction, prompts, buttons };
}

beforeEach(() => {
  vi.resetAllMocks();
  requireMamaBird.mockResolvedValue(true);
  getInactiveMembers.mockReturnValue(members);
  prepareMemberRemoval.mockReturnValue({ members, missing: [] });
  removeMembers.mockReturnValue({ removed: members, skipped: [] });
});

describe('member checkinactive', () => {
  it('lists inactive members with their mentions and Discord names without pinging them', async () => {
    const interaction = createInteraction({ options: createOptions({ subcommand: 'checkinactive' }) });
    await execute(interaction);
    const payload = interaction.editReply.mock.calls[0][0];
    expect(text(payload)).toContain('<@111111111111111111> `First player`');
    expect(text(payload)).toContain('<@222222222222222222> `Second player`');
    expect(payload.allowedMentions.parse).toEqual([]);
    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: 64 });
  });

  it('reports an empty inactive list', async () => {
    getInactiveMembers.mockReturnValue([]);
    const interaction = createInteraction({ options: createOptions({ subcommand: 'checkinactive' }) });
    await execute(interaction);
    expect(text(interaction.editReply.mock.calls[0][0])).toBe('No inactive members found.');
  });

  it('splits a large inactive list into messages without dropping members', async () => {
    const many = Array.from({ length: 150 }, (_, index) => ({ discord_id: `${index}`.padStart(18, '1'), discord_name: `Player ${index}` }));
    getInactiveMembers.mockReturnValue(many);
    const interaction = createInteraction({ options: createOptions({ subcommand: 'checkinactive' }) });
    await execute(interaction);
    const payloads = [...interaction.editReply.mock.calls, ...interaction.followUp.mock.calls].map(([payload]) => payload);
    expect(payloads.length).toBeGreaterThan(1);
    const combined = payloads.map(text).join('\n');
    for (const member of many) expect(combined).toContain(`<@${member.discord_id}> \`${member.discord_name}\``);
  });
});

describe('member removeplayer', () => {
  it('registers the subcommands and required mention option', () => {
    const command = data.toJSON();
    expect(command.options.find(option => option.name === 'checkinactive')).toBeDefined();
    expect(command.options.find(option => option.name === 'removeplayer').options[0])
      .toMatchObject({ name: 'mention', type: 3, required: true });
  });

  it.each(['checkinactive', 'removeplayer'])('denies %s to non-Mama Birds', async subcommand => {
    requireMamaBird.mockResolvedValue(false);
    await execute(createInteraction({ options: createOptions({ subcommand }) }));
    expect(getInactiveMembers).not.toHaveBeenCalled();
    expect(prepareMemberRemoval).not.toHaveBeenCalled();
    expect(removeMembers).not.toHaveBeenCalled();
  });

  it.each(['', 'bad', '<@111111111111111111> bad', 'prefix111111111111111111', '<@&111111111111111111>'])
    ('rejects invalid input %s without a partial deletion', async mention => {
      const { interaction } = createRemovalInteraction();
      interaction.options = createOptions({ subcommand: 'removeplayer', strings: { mention } });
      await execute(interaction);
      expect(text(interaction.reply.mock.calls[0][0])).toContain('Provide only valid Discord mentions or IDs');
      expect(prepareMemberRemoval).not.toHaveBeenCalled();
      expect(removeMembers).not.toHaveBeenCalled();
    });

  it('rejects missing members instead of silently deleting a subset', async () => {
    prepareMemberRemoval.mockReturnValue({ members: [members[0]], missing: [members[1].discord_id] });
    const { interaction } = createRemovalInteraction();
    await execute(interaction);
    expect(text(interaction.reply.mock.calls[0][0])).toContain(members[1].discord_id);
    expect(interaction.followUp).not.toHaveBeenCalled();
    expect(removeMembers).not.toHaveBeenCalled();
  });

  it('requires two owner-only green confirmations and shows every target with red cancel buttons', async () => {
    const { interaction, prompts, buttons } = createRemovalInteraction();
    buttons[0].update.mockImplementation(async () => {
      expect(removeMembers).not.toHaveBeenCalled();
      expect(interaction.followUp).toHaveBeenCalledTimes(1);
    });
    buttons[1].update.mockImplementation(async () => { expect(removeMembers).not.toHaveBeenCalled(); });
    await execute(interaction);
    expect(prepareMemberRemoval).toHaveBeenCalledWith(members.map(member => member.discord_id));
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
    for (const [payload] of interaction.followUp.mock.calls) {
      expect(text(payload)).toContain('This cannot be undone.');
      for (const member of members) expect(text(payload)).toContain(`${member.discord_id} \`${member.discord_name}\``);
      expect(payload.flags & MessageFlags.Ephemeral).toBe(MessageFlags.Ephemeral);
      expect(payload.components.at(-1).toJSON().components.map(button => button.style))
        .toEqual([ButtonStyle.Success, ButtonStyle.Danger]);
    }
    for (const [index, prompt] of prompts.entries()) {
      const { filter, time } = prompt.awaitMessageComponent.mock.calls[0][0];
      expect(time).toBe(60_000);
      expect(filter(buttons[index])).toBe(true);
      expect(filter({ ...buttons[index], user: { id: 'another-user' } })).toBe(false);
      expect(filter({ ...buttons[index], customId: 'member:removeplayer:99:confirm' })).toBe(false);
    }
    expect(requireMamaBird).toHaveBeenCalledTimes(3);
    expect(removeMembers).toHaveBeenCalledExactlyOnceWith({ members });
    expect(text(interaction.editReply.mock.calls[0][0])).toContain('Permanently removed 2 player(s)');
  });

  it('accepts a single raw Discord ID', async () => {
    const { interaction } = createRemovalInteraction();
    interaction.options = createOptions({ subcommand: 'removeplayer', strings: { mention: members[0].discord_id } });
    prepareMemberRemoval.mockReturnValue({ members: [members[0]], missing: [] });
    await execute(interaction);
    expect(prepareMemberRemoval).toHaveBeenCalledWith([members[0].discord_id]);
    expect(removeMembers).toHaveBeenCalledWith({ members: [members[0]] });
  });

  it.each([1, 2])('cancels at confirmation %i without deleting anything', async step => {
    const actions = ['confirm', 'confirm'];
    actions[step - 1] = 'cancel';
    const { interaction, buttons } = createRemovalInteraction(actions);
    await execute(interaction);
    expect(removeMembers).not.toHaveBeenCalled();
    expect(interaction.followUp).toHaveBeenCalledTimes(step);
    expect(text(buttons[step - 1].update.mock.calls[0][0])).toContain('Removal cancelled');
  });

  it.each([1, 2])('expires confirmation %i and removes its buttons without deleting', async step => {
    const { interaction, prompts } = createRemovalInteraction();
    prompts[step - 1].awaitMessageComponent.mockRejectedValue({ code: 'InteractionCollectorError' });
    await execute(interaction);
    expect(removeMembers).not.toHaveBeenCalled();
    const [messageId, payload] = interaction.webhook.editMessage.mock.calls[0];
    expect(messageId).toBe(`prompt-${step}`);
    expect(text(payload)).toContain('Confirmation expired');
    expect(payload.components).toHaveLength(1);
  });

  it.each([1, 2])('rechecks Mama Bird access at confirmation %i', async step => {
    const { interaction } = createRemovalInteraction();
    requireMamaBird.mockResolvedValueOnce(true);
    if (step === 2) requireMamaBird.mockResolvedValueOnce(true);
    requireMamaBird.mockResolvedValueOnce(false);
    await execute(interaction);
    expect(removeMembers).not.toHaveBeenCalled();
    expect(text(interaction.webhook.editMessage.mock.calls[0][1])).toContain('no longer a Mama Bird');
  });

  it('keeps both complete target lists when confirmation messages require pagination', async () => {
    const many = Array.from({ length: 100 }, (_, index) => ({ internal_id: index + 1,
      discord_id: String(index).padStart(18, '1'), discord_name: `Player ${index}` }));
    prepareMemberRemoval.mockReturnValue({ members: many, missing: [] });
    removeMembers.mockReturnValue({ removed: many, skipped: [] });
    const { interaction, buttons } = createRemovalInteraction();
    const verifyList = () => {
      const combined = interaction.followUp.mock.calls.map(([payload]) => text(payload)).join('\n');
      for (const member of many) expect(combined).toContain(`${member.discord_id} \`${member.discord_name}\``);
    };
    buttons[0].update.mockImplementation(async () => { verifyList(); interaction.followUp.mockClear(); });
    buttons[1].update.mockImplementation(async () => { verifyList(); });
    await execute(interaction);
    expect(removeMembers).toHaveBeenCalledWith({ members: many });
    for (const [payload] of interaction.followUp.mock.calls) expect(text(payload).length).toBeLessThanOrEqual(3500);
  });

  it('reports records skipped after concurrent changes', async () => {
    removeMembers.mockReturnValue({ removed: [members[0]], skipped: [members[1]] });
    const { interaction } = createRemovalInteraction();
    await execute(interaction);
    expect(text(interaction.editReply.mock.calls[0][0])).toContain('Permanently removed 1 player(s)');
    expect(text(interaction.editReply.mock.calls[0][0])).toContain('records changed or were already deleted');
  });
});
