/**
 * Line-based 3-way merge.
 *
 * @param {string} base   - Common ancestor text (last known server baseline)
 * @param {string} ours   - Text after the local user's edits
 * @param {string} theirs - Text after a remote user's save
 * @returns {string} Merged text.
 *
 * Rules:
 *   • If only one side changed a region → use that side's version.
 *   • If both sides changed the same region differently → theirs wins (last-write).
 *   • Completely non-overlapping edits from both sides are always preserved.
 *
 * Complexity: O(m·n) LCS — fine for typical wiki pages (< 2 000 lines).
 */
export function diff3Merge(base, ours, theirs) {
    if (ours === base) return theirs // we changed nothing — take theirs
    if (theirs === base) return ours // they changed nothing — keep ours
    if (ours === theirs) return ours // both made the exact same change

    const B = (base ?? "").split("\n")
    const O = (ours ?? "").split("\n")
    const T = (theirs ?? "").split("\n")

    /** Myers LCS — returns [[baseIdx, branchIdx], ...] for matching lines. */
    function lcs(a, b) {
        const m = a.length,
            n = b.length
        const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
        for (let i = 1; i <= m; i++)
            for (let j = 1; j <= n; j++)
                dp[i][j] =
                    a[i - 1] === b[j - 1]
                        ? dp[i - 1][j - 1] + 1
                        : Math.max(dp[i - 1][j], dp[i][j - 1])
        const pairs = []
        let i = m,
            j = n
        while (i > 0 && j > 0) {
            if (a[i - 1] === b[j - 1]) {
                pairs.unshift([i - 1, j - 1])
                i--
                j--
            } else if (dp[i - 1][j] >= dp[i][j - 1]) i--
            else j--
        }
        return pairs
    }

    /**
     * Convert LCS pairs into change hunks relative to base.
     * Each hunk: { baseStart, baseEnd, lines }
     *   Replace base[baseStart..baseEnd) with `lines`.
     *   Pure insertion  → baseStart === baseEnd, lines non-empty.
     *   Pure deletion   → lines === [].
     *   Replace         → both baseStart < baseEnd and lines non-empty.
     */
    function getHunks(baseArr, branchArr) {
        const pairs = lcs(baseArr, branchArr)
        const aug = [...pairs, [baseArr.length, branchArr.length]]
        const hunks = []
        let bi = 0,
            ci = 0
        for (const [nb, nc] of aug) {
            if (bi < nb || ci < nc) {
                hunks.push({
                    baseStart: bi,
                    baseEnd: nb,
                    lines: branchArr.slice(ci, nc),
                })
            }
            bi = nb + 1
            ci = nc + 1
        }
        return hunks
    }

    const ourHunks = getHunks(B, O)
    const theirHunks = getHunks(B, T)

    const result = []
    let bi = 0 // cursor into base
    let oi = 0 // index into ourHunks
    let ti = 0 // index into theirHunks

    while (bi <= B.length) {
        const nextOurStart =
            oi < ourHunks.length ? ourHunks[oi].baseStart : Infinity
        const nextTheirStart =
            ti < theirHunks.length ? theirHunks[ti].baseStart : Infinity
        const nextEvent = Math.min(nextOurStart, nextTheirStart)

        if (nextEvent === Infinity) {
            // No more hunks — flush any remaining unchanged base lines
            result.push(...B.slice(bi))
            break
        }

        // Flush unchanged base lines leading up to this event
        result.push(...B.slice(bi, nextEvent))
        bi = nextEvent

        // Collect all hunks from each side that start at or before the event position
        const oHunks = []
        const tHunks = []
        while (oi < ourHunks.length && ourHunks[oi].baseStart <= bi)
            oHunks.push(ourHunks[oi++])
        while (ti < theirHunks.length && theirHunks[ti].baseStart <= bi)
            tHunks.push(theirHunks[ti++])

        // Expand the region until no hunks from either branch partially overlap it
        let regionEnd = Math.max(
            ...oHunks.map((h) => h.baseEnd),
            ...tHunks.map((h) => h.baseEnd),
            bi,
        )
        let extended = true
        while (extended) {
            extended = false
            while (oi < ourHunks.length && ourHunks[oi].baseStart < regionEnd) {
                regionEnd = Math.max(regionEnd, ourHunks[oi].baseEnd)
                oHunks.push(ourHunks[oi++])
                extended = true
            }
            while (
                ti < theirHunks.length &&
                theirHunks[ti].baseStart < regionEnd
            ) {
                regionEnd = Math.max(regionEnd, theirHunks[ti].baseEnd)
                tHunks.push(theirHunks[ti++])
                extended = true
            }
        }

        if (oHunks.length > 0 && tHunks.length === 0) {
            // Only our side changed this region
            for (const h of oHunks) result.push(...h.lines)
        } else if (oHunks.length === 0 && tHunks.length > 0) {
            // Only their side changed this region
            for (const h of tHunks) result.push(...h.lines)
        } else {
            // Both sides changed overlapping lines — theirs wins (last-write wins)
            for (const h of tHunks) result.push(...h.lines)
        }

        bi = regionEnd
    }

    return result.join("\n")
}
