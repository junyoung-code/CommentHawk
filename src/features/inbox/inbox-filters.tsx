"use client";

import { CaretDown, Clock, Info, MagnifyingGlass, ShieldCheck, ShieldWarning, SlidersHorizontal, YoutubeLogo } from "@phosphor-icons/react";
import { useRef, useState } from "react";
import type { ActiveFilters } from "./comment-inbox";
import styles from "./inbox-feed.module.css";

type Props = {
  filters: ActiveFilters;
  videos: Array<{ id: string; title: string }>;
  categories: string[][];
  analysisStates: string[][];
  actionStates: string[][];
};

export function InboxFilters({ filters, videos, categories, analysisStates, actionStates }: Props) {
  const [selectedVideos, setSelectedVideos] = useState(filters.videoIds ?? []);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(filters.category || filters.analysisState || filters.actionState || (filters.period && filters.period !== "all")));
  const formRef = useRef<HTMLFormElement>(null);
  const active = filters.classificationStatus === "review_queue" ? "review_queue" : filters.reviewLevels.length === 3 ? "all" : filters.reviewLevels.length === 1 ? filters.reviewLevels[0] : "custom";

  const selectQuickFilter = (value: string) => {
    const form = formRef.current;
    if (!form) return;
    const levels = form.elements.namedItem("levels") as HTMLInputElement;
    const status = form.elements.namedItem("status") as HTMLInputElement;
    levels.value = value === "all" ? "safe,caution,risk" : value === "review_queue" ? "" : value;
    status.value = value === "review_queue" ? "review_queue" : "";
    form.requestSubmit();
  };

  return (
    <form action="/app/inbox" method="get" className={styles.filters} ref={formRef} aria-label="댓글 필터">
      <input type="hidden" name="levels" defaultValue={filters.reviewLevels.join(",")} />
      <input type="hidden" name="status" defaultValue={filters.classificationStatus ?? ""} />
      {filters.minConfidence != null ? <input type="hidden" name="minConfidence" value={filters.minConfidence} /> : null}
      {filters.maxConfidence != null ? <input type="hidden" name="maxConfidence" value={filters.maxConfidence} /> : null}
      <div className={styles.filterTop}>
        <details className={styles.videoPicker}>
          <summary><YoutubeLogo weight="fill" className={styles.youtube} aria-hidden="true" /><span>{selectedVideos.length === 0 ? "전체 영상" : selectedVideos.length === 1 ? videos.find(video => video.id === selectedVideos[0])?.title ?? "영상 1개 선택" : `영상 ${selectedVideos.length}개 선택`}</span><CaretDown aria-hidden="true" /></summary>
          <div className={styles.videoOptions}>
            <button type="button" onClick={() => setSelectedVideos([])}>전체 영상 선택</button>
            {videos.length === 0 ? <p>아직 가져온 영상이 없습니다.</p> : null}
            {videos.map(video => <label key={video.id}><input type="checkbox" name="video" value={video.id} checked={selectedVideos.includes(video.id)} onChange={event => setSelectedVideos(current => event.target.checked ? [...current, video.id] : current.filter(id => id !== video.id))} /><span>{video.title}</span></label>)}
            <button className={styles.apply} type="submit">영상 적용</button>
          </div>
        </details>
        <label className={styles.search}><span className="sr-only">댓글 검색</span><MagnifyingGlass aria-hidden="true" /><input type="search" name="search" defaultValue={filters.search ?? ""} placeholder="댓글, 작성자, 내용으로 검색하기" /><button type="submit" aria-label="검색 적용"><MagnifyingGlass aria-hidden="true" /></button></label>
        <button className={styles.advancedToggle} type="button" aria-expanded={advancedOpen} aria-controls="inbox-detail-filters" onClick={() => setAdvancedOpen(!advancedOpen)}><SlidersHorizontal aria-hidden="true" />상세 필터<CaretDown className={advancedOpen ? styles.rotated : ""} aria-hidden="true" /></button>
      </div>
      <div className={styles.filterBottom}>
        <div className={styles.quickFilters} role="group" aria-label="검토 등급">
          {([
            ["all", "전체", null], ["safe", "안전", ShieldCheck], ["caution", "주의", Info], ["risk", "위험", ShieldWarning], ["review_queue", "판단 보류", Clock],
          ] as const).map(([value, label, Icon]) => <button key={value} type="button" aria-pressed={active === value} className={active === value ? styles.active : ""} onClick={() => selectQuickFilter(value)}>{Icon ? <Icon className={styles[value]} aria-hidden="true" /> : null}{label}</button>)}
          {active === "custom" ? <span className={styles.customFilter}>복수 등급 선택됨</span> : null}
        </div>
        <label className={styles.sort}><span className="sr-only">댓글 정렬</span><select name="sort" defaultValue={filters.sort ?? "latest"} onChange={() => formRef.current?.requestSubmit()}><option value="latest">최신순</option><option value="likes">좋아요순</option></select></label>
      </div>
      <div id="inbox-detail-filters" className={styles.advanced} hidden={!advancedOpen}>
        <label><span>댓글 유형</span><select name="category" defaultValue={filters.category ?? ""}><option value="">전체 유형</option>{categories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>분석 상태</span><select name="analysis" defaultValue={filters.analysisState ?? ""}><option value="">전체 상태</option>{analysisStates.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>조치 상태</span><select name="action" defaultValue={filters.actionState ?? ""}><option value="">전체 상태</option>{actionStates.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label><span>기간</span><select name="period" defaultValue={filters.period ?? "all"}><option value="all">전체 기간</option><option value="7d">최근 7일</option><option value="30d">최근 30일</option><option value="90d">최근 90일</option></select></label>
        <a className={styles.reset} href="/app/inbox?levels=safe,caution,risk">초기화</a>
        <button className={styles.apply} type="submit">적용</button>
      </div>
    </form>
  );
}
