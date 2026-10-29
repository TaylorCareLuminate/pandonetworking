for f in ['connect/outcomes_calculator.html', 'demos/outcomes_calculator.html']:
    s = open(f, encoding='utf-8', newline='').read()

    def rep(old, new):
        global s
        assert s.count(old) == 1, (f, old[:50], s.count(old))
        s = s.replace(old, new)

    rep("const GEN_POST_FRACTION = 0.20;",
        "// Default message mix for Generate From Connect Analysis (fractions of total monthly volume)\n    const GEN_MIX = { post: 0.20, complement: 0.60, profile: 0.10, news: 0.10 };")
    rep("{ post: ['post'], complement: ['complement'], news: ['news', 'org_news'] };",
        "{ post: ['post'], complement: ['complement'], profile: ['profile'], news: ['news', 'org_news'] };")
    rep("const GEN_ZERO_TYPES = ['fast_prospect', 'profile', 'direct_company'];",
        "const GEN_ZERO_TYPES = ['fast_prospect', 'direct_company'];")
    rep("const typeF = { connect: mt.connect / b.connect, reply: mt.reply / b.reply, meeting: mt.meeting / b.meeting };",
        "// No analysis rows for this message type -> use the org-type baseline (factor 1) rather than flooring\n        const typeF = mt.n > 0 ? { connect: mt.connect / b.connect, reply: mt.reply / b.reply, meeting: mt.meeting / b.meeting } : { connect: 1, reply: 1, meeting: 1 };")
    i = s.index("        const complementN = ANALYSIS_DATA.msgTypes.complement.n || 0;")
    j = s.index("        Object.entries({ post: sentPost")
    s = s[:i] + """        const sentPost = Math.round(total * GEN_MIX.post);
        const sentComplement = Math.round(total * GEN_MIX.complement);
        const sentProfile = Math.round(total * GEN_MIX.profile);
        const sentNews = Math.max(0, total - sentPost - sentComplement - sentProfile);

""" + s[j:]
    rep("Object.entries({ post: sentPost, complement: sentComplement, news: sentNews })",
        "Object.entries({ post: sentPost, complement: sentComplement, profile: sentProfile, news: sentNews })")
    rep("Math.round(GEN_POST_FRACTION * 100)", "Math.round(GEN_MIX.post * 100)")
    rep("Math.round(complementShare * remaining * 100)}%</strong> (${sentComplement.toLocaleString()}),",
        "Math.round(GEN_MIX.complement * 100)}%</strong> (${sentComplement.toLocaleString()}),\n            Profile Message <strong>${Math.round(GEN_MIX.profile * 100)}%</strong> (${sentProfile.toLocaleString()}),")
    rep("Math.round((1 - complementShare) * remaining * 100)", "Math.round(GEN_MIX.news * 100)")
    rep("Fast Prospect, Profile Message and Direct Company Message were turned off",
        "Fast Prospect and Direct Company Message were turned off")
    rep("(Post Reply capped at 20%, the rest split between Common Ground and Organization News by historical share)",
        "(default mix: 20% Post Reply, 60% Common Ground, 10% Profile Message, 10% Organization News)")
    open(f, 'w', encoding='utf-8', newline='').write(s)
