export const TOPICS = [
  "product-management",
  "growth",
  "leadership",
  "strategy",
  "startups",
  "ai",
  "design",
  "engineering",
  "marketing",
  "sales",
  "career",
  "culture",
  "analytics",
  "b2b",
  "b2c",
  "marketplaces",
  "fundraising",
] as const;

export const TOPIC_LABELS: Record<string, string> = {
  "product-management": "产品管理",
  growth: "增长",
  leadership: "领导力",
  strategy: "战略",
  startups: "创业",
  ai: "AI",
  design: "设计",
  engineering: "工程",
  marketing: "市场",
  sales: "销售",
  career: "职业发展",
  culture: "组织文化",
  analytics: "数据分析",
  b2b: "B2B",
  b2c: "B2C",
  marketplaces: "平台与市场",
  fundraising: "融资",
  newsletter: "Newsletter",
};

export const PAGE_SIZE = 20;

export function topicLabel(topic: string) {
  return TOPIC_LABELS[topic] ?? topic.replaceAll("-", " ");
}
