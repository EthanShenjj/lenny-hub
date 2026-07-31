"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import {
  IconArrowRight,
  IconBook2,
  IconCalendar,
  IconClock,
  IconMicrophone2,
  IconSearch,
  IconSparkles,
} from "@tabler/icons-react";
import type { ContentSearchResult } from "@/lib/types";
import { topicLabel } from "@/lib/constants";

interface Filters {
  q: string;
  mode: "keyword" | "semantic";
  type: string;
  topic: string;
  year: string;
  guest: string;
  bodyStatus: string;
  insightStatus: string;
  sort: string;
}

const defaults: Filters = {
  q: "",
  mode: "keyword",
  type: "all",
  topic: "",
  year: "",
  guest: "",
  bodyStatus: "all",
  insightStatus: "all",
  sort: "relevance",
};

const insightLabels: Record<string, string> = {
  not_started: "待解读",
  ready: "已解读",
  stale: "需更新",
  failed: "生成失败",
  running: "生成中",
};

export function ContentBrowser({
  initialData,
  initialFilters = {},
}: {
  initialData: ContentSearchResult;
  initialFilters?: Partial<Filters>;
}) {
  const startingFilters = { ...defaults, ...initialFilters };
  const [filters, setFilters] = useState<Filters>(startingFilters);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = async (next: Filters, page = 1) => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    Object.entries(next).forEach(([key, value]) => {
      if (value && value !== "all") params.set(key, value);
    });
    params.set("page", String(page));
    try {
      const response = await fetch(`/api/content?${params.toString()}`);
      const payload = (await response.json()) as ContentSearchResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "检索失败");
      setData(payload);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void load(filters);
  };

  const update = (key: keyof Filters, value: string, immediate = false) => {
    const next = { ...filters, [key]: value };
    setFilters(next);
    if (immediate) void load(next);
  };

  const reset = () => {
    setFilters(defaults);
    void load(defaults);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <form className="library-controls" onSubmit={submit}>
        <div className="search-row">
          <label className="search-box search-box-compact">
            <IconSearch size={19} />
            <span className="sr-only">搜索内容</span>
            <input
              value={filters.q}
              onChange={(event) => update("q", event.target.value)}
              placeholder="搜索主题、嘉宾、观点或原文..."
            />
          </label>
          <div className="segmented-control" aria-label="搜索模式">
            <button
              type="button"
              className={filters.mode === "keyword" ? "active" : ""}
              onClick={() => update("mode", "keyword")}
            >
              全文
            </button>
            <button
              type="button"
              className={filters.mode === "semantic" ? "active" : ""}
              onClick={() => update("mode", "semantic")}
            >
              语义
            </button>
          </div>
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? "检索中…" : "搜索"}
          </button>
        </div>
        <div className="filter-grid">
          <FilterSelect
            label="类型"
            value={filters.type}
            onChange={(value) => update("type", value, true)}
            options={[
              ["all", "全部类型"],
              ["podcast", "Podcast"],
              ["newsletter", "Newsletter"],
            ]}
          />
          <FilterSelect
            label="主题"
            value={filters.topic}
            onChange={(value) => update("topic", value, true)}
            options={[
              ["", "全部主题"],
              ...data.facets.topics.map((topic) => [topic, topicLabel(topic)]),
            ]}
          />
          <FilterSelect
            label="年份"
            value={filters.year}
            onChange={(value) => update("year", value, true)}
            options={[
              ["", "全部年份"],
              ...data.facets.years.map((year) => [year, year]),
            ]}
          />
          <FilterSelect
            label="嘉宾"
            value={filters.guest}
            onChange={(value) => update("guest", value, true)}
            options={[
              ["", "全部嘉宾"],
              ...data.facets.guests.map((guest) => [guest, guest]),
            ]}
          />
          <FilterSelect
            label="正文"
            value={filters.bodyStatus}
            onChange={(value) => update("bodyStatus", value, true)}
            options={[
              ["all", "全部状态"],
              ["available", "正文可用"],
              ["preview", "仅公开预览"],
              ["missing", "正文待补充"],
            ]}
          />
          <FilterSelect
            label="解读"
            value={filters.insightStatus}
            onChange={(value) => update("insightStatus", value, true)}
            options={[
              ["all", "全部状态"],
              ["ready", "已解读"],
              ["not_started", "待解读"],
              ["stale", "需更新"],
              ["failed", "生成失败"],
            ]}
          />
          <FilterSelect
            label="排序"
            value={filters.sort}
            onChange={(value) => update("sort", value, true)}
            options={[
              ["relevance", "相关度"],
              ["latest", "最新发布"],
              ["length", "篇幅最长"],
            ]}
          />
          <button className="text-button filter-reset" type="button" onClick={reset}>
            重置筛选
          </button>
        </div>
      </form>

      <div className="results-toolbar">
        <p>
          找到 <strong>{data.total}</strong> 条内容
          {data.searchMode === "semantic" && <span className="mode-badge">语义排序</span>}
        </p>
        <span>
          第 {data.page} / {totalPages} 页
        </span>
      </div>
      {data.notice && <div className="notice">{data.notice}</div>}
      {error && <div className="error-notice">{error}</div>}

      <div className={`content-list ${loading ? "content-list-loading" : ""}`}>
        {data.items.map((item) => (
          <article className="content-card" key={item.id}>
            <div className={`content-type-icon ${item.type}`}>
              {item.type === "podcast" ? (
                <IconMicrophone2 size={20} />
              ) : (
                <IconBook2 size={20} />
              )}
            </div>
            <div className="content-card-body">
              <div className="content-card-topline">
                <span className="type-label">
                  {item.type === "podcast" ? "PODCAST" : "NEWSLETTER"}
                </span>
                <span className={`status-pill status-${item.insightStatus}`}>
                  {item.insightStatus === "ready" && <IconSparkles size={13} />}
                  {insightLabels[item.insightStatus]}
                </span>
              </div>
              <Link href={`/content/${item.id}`} className="content-title-link">
                <h2>{item.title}</h2>
              </Link>
              {item.description && <p className="content-description">{item.description}</p>}
              <div className="content-meta">
                {item.guest && <span>{item.guest}</span>}
                {item.publishedAt && (
                  <span>
                    <IconCalendar size={14} /> {item.publishedAt}
                  </span>
                )}
                <span>
                  <IconClock size={14} /> {item.wordCount.toLocaleString()} 词
                </span>
              </div>
              <div className="tag-row">
                {item.tags.slice(0, 5).map((tag) => (
                  <span className="tag" key={tag}>
                    {topicLabel(tag)}
                  </span>
                ))}
              </div>
            </div>
            <Link
              href={`/content/${item.id}`}
              className="content-open"
              aria-label={`查看 ${item.title}`}
            >
              <IconArrowRight size={20} />
            </Link>
          </article>
        ))}
        {!data.items.length && (
          <div className="empty-state">
            <IconSearch size={28} />
            <h2>没有找到匹配内容</h2>
            <p>尝试减少筛选条件，或换一个更通用的关键词。</p>
            <button className="secondary-button" type="button" onClick={reset}>
              清空筛选
            </button>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="secondary-button"
            type="button"
            disabled={data.page <= 1 || loading}
            onClick={() => void load(filters, data.page - 1)}
          >
            上一页
          </button>
          <span>
            {data.page} / {totalPages}
          </span>
          <button
            className="secondary-button"
            type="button"
            disabled={data.page >= totalPages || loading}
            onClick={() => void load(filters, data.page + 1)}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[][];
}) {
  return (
    <label className="filter-field">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={`${label}-${optionValue}`}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
