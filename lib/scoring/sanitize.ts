import type { ParsedCandidateProfile, RoleT, SanitizedCandidateProfile } from "@/lib/types";

/**
 * Builds the object the AI scoring pipeline actually sees. Name, email, and
 * phone are not masked — they are absent entirely; there's no field for the
 * AI layer to accidentally read. Skills/education/companies pass through
 * because they're job-relevant, not personal-identity fields.
 */
export function buildSanitizedProfile(
  parsed: ParsedCandidateProfile,
  appliedRole: RoleT,
  resumeBullets: string[]
): SanitizedCandidateProfile {
  return {
    appliedRole,
    currentRole: parsed.currentRole,
    previousRoles: parsed.previousRoles,
    companies: parsed.companies,
    yearsOfExperience: parsed.yearsOfExperience,
    education: parsed.education,
    skills: parsed.skills,
    resumeBullets,
  };
}
