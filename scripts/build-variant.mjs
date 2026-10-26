// 私人数据只在显式 --personal 构建时进入 dist-private，普通构建不读取私人文件。
export function applyBuildVariant(header, config, profile = null) {
  if (profile === null) return { header, config };
  if (typeof profile.intro !== "string" || typeof profile.profile !== "string" || !profile.profile.trim()) {
    throw new Error("candidate.private.json 需要 intro 和非空 profile 字符串");
  }
  const replaceRequired = (source, marker, value) => {
    if (!source.includes(marker)) throw new Error(`构建标记缺失：${marker}`);
    return source.replace(marker, () => value);
  };
  header = replaceRequired(header, "// @name         BOSS 岗位定制招呼助手\n", "// @name         BOSS 岗位定制招呼助手（个人副本）\n");
  header = replaceRequired(header, "local.boss-auto-apply.custom", "local.boss-auto-apply.personal-copy");
  config = replaceRequired(config, 'const APP_ID = "boss-auto-apply-custom"; // @build-identity', 'const APP_ID = "boss-auto-apply-personal-copy"; // @build-identity');
  config = replaceRequired(config, "const PERSONAL_BUILD = false; // @build-variant", "const PERSONAL_BUILD = true; // @build-variant");
  config = replaceRequired(config,
    'const DEFAULT_CANDIDATE = { intro: "", profile: "" }; // @personal-profile',
    `const DEFAULT_CANDIDATE = ${JSON.stringify({ intro: profile.intro, profile: profile.profile, experience: typeof profile.experience === "string" ? profile.experience : "" })}; // @personal-profile`);
  const service = profile.service || {};
  config = replaceRequired(config,
    'const DEFAULT_AI_SERVICE = { endpoint: "", model: "", httpOrigin: "" }; // @personal-service',
    `const DEFAULT_AI_SERVICE = ${JSON.stringify({ endpoint: service.endpoint || "", model: service.model || "", httpOrigin: service.httpOrigin || "" })}; // @personal-service`);
  return { header, config };
}
