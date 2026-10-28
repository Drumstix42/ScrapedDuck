const STAR_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

/**
 * Split a raid label (e.g. "Five-Star Shadow Raids", "Two-Star Max Battles") into
 * the boss's battle category and its star tier.
 *
 * @param {string} label raid heading text naming the battle type and/or star count.
 * @param {string} bossName optional; a Gigantamax (or Eternamax) boss listed under a
 *   generic Max Battle header is still typed as Gigantamax.
 * @return {{raidType: ?string, tier: ?number}} raidType is one of "Raid", "Shadow",
 *   "Mega", "Super Mega", "Primal", "Max Battle" or "Gigantamax"; tier is null when
 *   the label names no star count.
 */
function parse(label, bossName)
{
    if (!label) return { raidType: null, tier: null };

    const labelLower = label.toLowerCase();
    const starMatch = labelLower.match(/\b(one|two|three|four|five|six|[1-6])[\s-]*star\b/);
    const tier = starMatch ? (STAR_WORDS[starMatch[1]] || Number(starMatch[1])) : null;

    // Max Battles are their own battle mode; Gigantamax battles are always six-star.
    // Eternamax battles play like Gigantamax ones but have no star tier of their own.
    const isMaxBattle = labelLower.includes('max battle') || labelLower.includes('dynamax');
    const isEternamax = /^eternamax\b/i.test(bossName || '');
    if (labelLower.includes('gigantamax') || (isMaxBattle && (isEternamax || /^gigantamax\b/i.test(bossName || '')))) {
        return { raidType: 'Gigantamax', tier: tier || (isEternamax ? null : 6) };
    }
    if (isMaxBattle) return { raidType: 'Max Battle', tier: tier };

    if (labelLower.includes('super mega')) return { raidType: 'Super Mega', tier: tier };
    if (labelLower.includes('mega')) return { raidType: 'Mega', tier: tier };
    if (labelLower.includes('primal')) return { raidType: 'Primal', tier: tier };
    if (labelLower.includes('shadow')) return { raidType: 'Shadow', tier: tier };
    if (tier) return { raidType: 'Raid', tier: tier };

    return { raidType: null, tier: null }; // Unknown type
}

module.exports = { parse }
