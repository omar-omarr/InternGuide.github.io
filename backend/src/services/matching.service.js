function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
}

function terms(value) {
  return Array.from(
    new Set(
      normalize(value)
        .split(/[\s,;/|]+/)
        .map((term) => term.trim())
        .filter((term) => term.length > 1),
    ),
  );
}

function includesPhrase(haystack, needle) {
  return Boolean(needle && normalize(haystack).includes(normalize(needle)));
}

function calculateMatch(profile, internship) {
  const reasons = [];
  let score = 0;
  const searchableRole = [
    internship.title,
    internship.category,
    internship.description,
    internship.requirements,
    internship.required_skills,
  ].join(' ');
  const major = profile?.profile_major || profile?.user_major;
  const department = profile?.department_name;

  if (includesPhrase(searchableRole, major) || includesPhrase(searchableRole, department)) {
    score += 30;
    reasons.push('Major or department matches');
  }

  const studentSkills = terms(profile?.skills);
  const requiredSkills = terms(internship.required_skills || internship.requirements);
  const matchedSkills = requiredSkills.filter((skill) => studentSkills.some((studentSkill) => studentSkill === skill));

  if (requiredSkills.length && matchedSkills.length) {
    score += Math.round(35 * Math.min(matchedSkills.length / requiredSkills.length, 1));
    reasons.push(`${matchedSkills.length} of ${requiredSkills.length} required skills matched`);
  }

  if (includesPhrase(internship.location, profile?.location_preference)) {
    score += 15;
    reasons.push('Location preference matches');
  }

  if (
    profile?.internship_type_preference &&
    normalize(profile.internship_type_preference) === normalize(internship.type)
  ) {
    score += 10;
    reasons.push('Internship type preference matches');
  }

  if (includesPhrase(internship.academic_year || internship.requirements, profile?.academic_year)) {
    score += 10;
    reasons.push('Academic year matches');
  }

  if (!reasons.length) {
    reasons.push('Complete your university profile and preferences for a stronger match');
  }

  return {
    score: Math.max(0, Math.min(score, 100)),
    reasons,
  };
}

module.exports = {
  calculateMatch,
};
