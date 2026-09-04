import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeBlack from 'starlight-theme-black';

export default defineConfig({
  site: 'https://reelax.hsiyue.com',
  base: '/faq',
  trailingSlash: 'always',
  integrations: [
    starlight({
      title: '奥术摸鱼大师辅助脚本文档站',
      description: '奥术摸鱼大师辅助的功能说明、使用示例和常见问题。',
      favicon: '/script-ball.png',
      plugins: [
        starlightThemeBlack({
          docs: {
            showMarkdownActions: false,
          },
          navLinks: [],
        }),
      ],
      locales: {
        root: {
          label: '简体中文',
          lang: 'zh-CN',
        },
      },
      customCss: ['./src/styles/custom.css'],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
      },
      head: [{ tag: 'script', attrs: { src: '/faq/analytics.js', defer: true } }],
      lastUpdated: true,
      pagination: true,
      sidebar: [
        { label: '帮助中心首页', slug: 'index' },
        {
          label: '设置',
          items: [{
            label: '日常',
            items: [
            { label: '地图导航', slug: '日常/地图导航' },
            { label: '鱼饵切换', slug: '日常/鱼饵切换' },
            { label: '船队管理', slug: '日常/船队管理' },
            { label: '公会管理', slug: '日常/公会管理' },
            ],
          }, {
            label: '赛事',
            items: [
            { label: '比赛辅助', slug: '赛事/比赛辅助' },
            { label: '世界 Boss', slug: '赛事/世界首领' },
            { label: '奥秘献祭', slug: '赛事/奥秘献祭' },
            ],
          }, {
            label: '资产',
            items: [
            { label: 'Buff 购买', slug: '资产/购买-buff' },
            { label: '属性加点', slug: '资产/属性加点' },
            { label: '地图专精献祭', slug: '资产/地图专精献祭' },
            { label: '出售鱼类', slug: '资产/出售鱼类' },
            { label: '出售装备', slug: '资产/出售装备' },
            ],
          }, {
            label: '其他',
            items: [
            { label: '通用辅助', slug: '其他/通用辅助' },
            { label: '显示与统计', slug: '其他/显示与统计' },
            ],
          }],
        },
        { label: '日志', slug: '日志' },
        { label: '反馈', slug: '反馈' },
        {
          label: '关于',
          items: [
            { label: '关于帮助中心', slug: '关于' },
            { label: '更新历史', slug: '关于/更新历史' },
            { label: '下载链接', slug: '关于/下载链接' },
            { label: '问卷调查结果', slug: '关于/问卷调查结果' },
            { label: '支持开发', slug: '关于/支持开发' },
          ],
        },
      ],
    }),
  ],
});
