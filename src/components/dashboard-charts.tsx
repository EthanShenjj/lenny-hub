"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardStats } from "@/lib/types";
import { topicLabel } from "@/lib/constants";

const tooltipStyle = {
  border: "1px solid #e8e5e0",
  borderRadius: 12,
  boxShadow: "0 12px 32px rgba(20, 18, 15, 0.08)",
  fontSize: 12,
};

export function TrendChart({ data }: { data: DashboardStats["monthlyTrend"] }) {
  return (
    <div className="chart-frame" aria-label="按月发布趋势图">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke="#eeeae4" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={(value) => String(value).slice(5)}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#827d75", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#827d75", fontSize: 11 }}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12 }} />
          <Line
            name="Podcast"
            type="monotone"
            dataKey="podcast"
            stroke="#f36b24"
            strokeWidth={2.4}
            dot={false}
          />
          <Line
            name="Newsletter"
            type="monotone"
            dataKey="newsletter"
            stroke="#27231f"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TopicCoverageChart({
  data,
}: {
  data: DashboardStats["topicCoverage"];
}) {
  const visible = [...data]
    .sort((a, b) => b.podcast + b.newsletter - (a.podcast + a.newsletter))
    .slice(0, 8)
    .map((item) => ({ ...item, label: topicLabel(item.topic) }));
  return (
    <div className="chart-frame" aria-label="Podcast 与 Newsletter 主题覆盖对比">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={visible}
          layout="vertical"
          margin={{ top: 4, right: 8, left: 18, bottom: 0 }}
        >
          <CartesianGrid stroke="#eeeae4" horizontal={false} />
          <XAxis
            type="number"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#827d75", fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={62}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#625d56", fontSize: 11 }}
          />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12 }} />
          <Bar name="Podcast" dataKey="podcast" fill="#f36b24" radius={[0, 3, 3, 0]} />
          <Bar
            name="Newsletter"
            dataKey="newsletter"
            fill="#2f2b27"
            radius={[0, 3, 3, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
