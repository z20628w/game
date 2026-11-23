// 更新规则时同步核对适用范围、官方来源与核对日期。
export const reviewedOn = '2026-11-03'

export const markets = [
  {
    id: 'eu', title: '欧盟',
    rules: [
      {
        type: 'required', title: '产品安全投诉与事故报告渠道',
        scope: '面向欧盟销售、适用《通用产品安全条例》的商品。此项针对承担制造商义务的经营者，例如符合条件的自有品牌商家。',
        requirement: '制造商须公开可供消费者报告投诉、事故或安全问题的渠道，并考虑无障碍需求。电话、电子地址或网站专区均可作为渠道。',
        implementation: '主题提供容易找到的「产品安全反馈」入口，按情况接电话、邮箱或表单。客服将报告送到负责产品安全的团队，按适用要求调查和记录。',
        source: ['欧盟《通用产品安全条例》第 9(11) 至 9(13) 条', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32023R0988']
      },
      {
        type: 'required', title: '商品报价须展示安全信息',
        scope: '面向欧盟消费者且适用《通用产品安全条例》第 19 条的线上商品报价。',
        requirement: '清晰展示制造商及邮寄和电子联系地址。制造商在欧盟之外时，还须显示欧盟责任人及其联系方式。展示商品识别信息和适用的安全警示。',
        implementation: '后台定义制造商、欧盟责任人和安全警示元字段，商品模板显著展示，按目标成员国核对警示语言。上架前检查必填数据。',
        source: ['欧盟《通用产品安全条例》第 19 条', 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=celex%3A32023R0988']
      },
      {
        type: 'required', title: '在线订立合同的撤回功能',
        scope: '消费者通过在线界面订立且享有撤回权的远程合同。欧盟指令要求成员国自 2026 年 6 月 19 日起适用转置措施，逐国核对本地规则。',
        requirement: '撤回期间持续提供显著、易访问的入口，支持填写或确认必要信息、确认提交，并及时以可长期保存的方式回执，含撤回内容和提交日期时间。',
        implementation: '主题提供入口和界面。应用或后端接收请求、留存提交记录并发回执，业务方处理后续订单及退款流程。',
        source: ['欧盟指令 2023/2673，新增第 11a 条及适用日期', 'https://eur-lex.europa.eu/eli/dir/2023/2673/oj/eng']
      }
    ]
  },
  {
    id: 'de', title: '德国',
    rules: [
      {
        type: 'required', title: '公开联系方式与投诉信息',
        scope: '适用德国消费者远程交易规则的经营者，按适用范围在缔约前披露。',
        requirement: '提供经营地址、电话和邮箱。投诉地址有别于经营地址时补充披露，适用时说明投诉处理程序。',
        implementation: '主题的联系页与页脚展示真实联系方式，政策页提供适用的投诉说明。后台维护地址、电话、邮箱，并确认实际能收到咨询。',
        source: ['德国《民法施行法》第 246a 条第 1 节', 'https://www.gesetze-im-internet.de/bgbeg/art_246a__1.html']
      },
      {
        type: 'required', title: '提供明确的撤回与确认入口',
        scope: '适用德国法、在网上订立且消费者享有撤回权的远程合同。',
        requirement: '撤回入口与确认按钮须使用清楚的文案，例如「撤回合同」「确认撤回」的德语等义表述。确认后立即提供包含内容、接收日期与时间的可保存回执。',
        implementation: '主题设计独立的撤回入口与确认界面，应用或后端负责提交、记录和回执。普通留言表单须补齐这一完整流程才能承担撤回用途。',
        source: ['德国《民法典》第 356a 条', 'https://www.gesetze-im-internet.de/bgb/__356a.html']
      }
    ]
  },
  {
    id: 'fr', title: '法国',
    rules: [
      {
        type: 'required', title: '公布适用的消费调解渠道',
        scope: '适用法国消费调解义务的经营者，存在行业例外。',
        requirement: '在网站及适用的销售文件中清楚披露指定消费调解员的联系方式和网站。消费者通常先向商家书面投诉，未解决时再申请调解。',
        implementation: '在售后或销售条款页展示实际适用的调解机构，并在页脚提供链接。客服保留书面投诉渠道和处理记录。',
        source: ['法国竞争、消费与反欺诈总局消费调解指引', 'https://www.economie.gouv.fr/dgccrf/les-fiches-pratiques/la-mediation-de-la-consommation-ce-que-vous-devez-savoir']
      },
      {
        type: 'restricted', title: '不得把拒绝追踪做得比接受更难',
        scope: '适用法国 Cookie 与类似追踪规则且需要同意的追踪器，例如通常需要同意的广告追踪。',
        requirement: '需要同意的追踪应在同意后启用，拒绝应与接受同样容易。依法豁免的追踪器另行判断。',
        implementation: '配置 Shopify 客户隐私或同意管理应用。UI 同时提供清晰的接受和拒绝选项，开发验证拒绝后广告像素、应用和自定义脚本的实际请求。',
        source: ['法国国家信息与自由委员会 Cookie 横幅执法指引', 'https://www.cnil.fr/en/dark-patterns-cookie-banners-cnil-issues-formal-notice-website-publishers']
      }
    ]
  },
  {
    id: 'uk', title: '英国',
    rules: [
      {
        type: 'required', title: '下单前披露商家信息和取消方式',
        scope: '适用英国消费者远程销售规则的交易，按商品、服务及例外判断取消权。',
        requirement: '订单前提供商家名称、联系方式和地址，以及适用的取消条件、方式和标准表格等信息，并按要求提供可保存的信息。',
        implementation: '主题和政策页展示联系及取消信息，确认邮件等持久媒介纳入必要内容。产品核对消费者是否能在下单前找到信息。',
        source: ['英国政府远程销售指引', 'https://www.gov.uk/online-and-distance-selling-for-businesses']
      }
    ]
  },
  {
    id: 'us', title: '美国',
    rules: [
      {
        type: 'restricted', title: '不得伪造评论或以好评换奖励',
        scope: '适用美国联邦贸易委员会消费者评论与推荐规则的经营活动。',
        requirement: '规则禁止规定范围内的虚假评论、将奖励与评论倾向挂钩，以及特定的压制评论行为。',
        implementation: '评论模块可以实现。应用和运营流程保留来源与审核记录，奖励与评分脱钩，按同一标准处理正负面评论。',
        source: ['美国联邦贸易委员会评论规则问答', 'https://www.ftc.gov/business-guidance/resources/consumer-reviews-testimonials-rule-questions-answers']
      },
      {
        type: 'required', title: '加州 · 适用时提供数据退出机制',
        scope: '适用《加州消费者隐私法》且存在法规所定义的出售或共享个人信息的企业。',
        requirement: '按适用规则提供退出出售或共享的方式，并将符合要求的全局隐私控制等信号视为有效退出请求。链接形式取决于适用规则和企业所采用的机制。',
        implementation: '配置 Shopify 客户隐私与数据退出入口，核对地区和全局隐私控制信号。测试第三方像素与应用是否执行退出选择。',
        source: ['加州隐私保护局常见问题', 'https://cppa.ca.gov/faq']
      }
    ]
  },
  {
    id: 'au', title: '澳大利亚',
    rules: [
      {
        type: 'restricted', title: '不得用「概不退款」排除法定保障',
        scope: '适用《澳大利亚消费者法》消费者保障的交易。',
        requirement: '退款政策不能排除法定的维修、更换或退款救济。可将单纯改变主意的自愿退货政策和法定保障分开说明。',
        implementation: '后台退款政策明确两类场景，主题在商品与售后入口展示。客服按实际故障情形提供适用救济。',
        source: ['澳大利亚竞争与消费者委员会消费者保障指引', 'https://www.accc.gov.au/business/selling-products-and-services/consumer-rights-and-guarantees']
      }
    ]
  }
]
