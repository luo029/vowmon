/**
 * 站点公共配置（会提交进仓库，所有访客共用）
 *
 * 站点只放网站本体，**数据与图片都不在这个仓库**：
 *   数据 -> vowmon_data（JSON，前台运行时拉取）
 *   图片 -> vowmon_imgs（按编号命名的 PNG）
 *
 * imgCdnBase：图片的公开访问前缀。数据里存的是相对路径（如 sprites/001.png），
 *   前台拼上这个前缀才能显示。不填则退化为站点相对路径（通常会 404）。
 *
 * dataCdnBase：数据 JSON 的访问前缀。默认走本站 /data 反向代理（CF 边缘缓存，60 秒）。
 *   加载器还会在失败时自动回退 jsDelivr -> raw.githubusercontent，见 js/data-loader.js。
 *
 * 优先级：浏览器 localStorage 里的 vowmon_sync_config（后台同步配置）
 *         > 本文件。也就是说访客看到的是这里的值，你自己本机可以用后台配置覆盖来调试。
 */
window.VOWMON_SITE_CONFIG = {
    // 图片走本站 /img/* 反向代理（Cloudflare Pages Functions），CF 边缘缓存回源 GitHub。
    // 想换回 jsDelivr 直连就填：https://cdn.jsdelivr.net/gh/luo029/vowmon_imgs@main
    imgCdnBase: 'https://vowmon.pages.dev/img',
    // 数据走本站 /data/* 反向代理，源站是 vowmon_data 仓库
    dataCdnBase: 'https://vowmon.pages.dev/data'
};
