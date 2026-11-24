/**
 * 站点公共配置（会提交进仓库，所有访客共用）
 *
 * imgCdnBase：图片仓库的公开访问前缀。
 *   上传到 vowmon_imgs 的图片在数据里存的是相对路径（如 sprites/001.png），
 *   前台需要拼上这个前缀才能显示。不填则退化为站点相对路径（通常会 404）。
 *
 * 优先级：浏览器 localStorage 里的 vowmon_sync_config.imgCdnBase（后台同步配置）
 *         > 本文件的 imgCdnBase。
 *        也就是说：访客看到的是这里的值，你自己本机可以随时用后台配置覆盖来调试。
 *
 * 换了图片仓库 / 换成 Cloudflare Pages 域名时，改这里一处即可。
 */
window.VOWMON_SITE_CONFIG = {
    imgCdnBase: 'https://cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main'
};
