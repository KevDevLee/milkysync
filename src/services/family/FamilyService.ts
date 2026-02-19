import { supabase } from '@/services/supabase/client';

function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let index = 0; index < 8; index += 1) {
    result += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return result;
}

export class FamilyService {
  async generateInviteCode(input: { familyId: string; createdByUserId: string }): Promise<string> {
    const code = makeInviteCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from('family_invites').insert({
      code,
      family_id: input.familyId,
      created_by: input.createdByUserId,
      created_at: now.toISOString(),
      expires_at: expiresAt
    });

    if (error) {
      throw error;
    }

    return code;
  }

  async joinFamilyByCode(input: { code: string; userId: string }): Promise<{ familyId: string }> {
    const normalizedCode = input.code.trim().toUpperCase();

    const { data: invite, error: inviteError } = await supabase
      .from('family_invites')
      .select('code, family_id, expires_at')
      .eq('code', normalizedCode)
      .maybeSingle();

    if (inviteError) {
      throw inviteError;
    }

    if (!invite) {
      throw new Error('Invite code not found.');
    }

    if (new Date(invite.expires_at).getTime() < Date.now()) {
      throw new Error('Invite code has expired.');
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        family_id: invite.family_id,
        updated_at: new Date().toISOString()
      })
      .eq('id', input.userId);

    if (updateError) {
      throw updateError;
    }

    return { familyId: invite.family_id as string };
  }
}

export const familyService = new FamilyService();
