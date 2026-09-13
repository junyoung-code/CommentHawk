"use client";

import { CaretDown, ChatText, Info, ThumbsDown, ThumbsUp, User } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import styles from "./landing.module.css";

export function LandingComment({ variant }: { variant: "original" | "refined" }) {
  const refined = variant === "refined";
  const [reaction, setReaction] = useState<"like" | "dislike" | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);

  return (
    <article className={`${styles.comment} ${refined ? styles.refined : styles.original}`} aria-label={refined ? "정리된 피드백 예시" : "원문 댓글 예시"}>
      <div className={styles.commentHeader}>
        <User className={styles.avatar} weight="fill" aria-hidden="true" />
        <div className={styles.author}>@example <span>· 2시간 전</span>
          {refined && <Image src="/brand/shifty-owl-profile.png" width={24} height={24} alt="시프티가 표현을 정리했어요" />}
        </div>
      </div>
      <p className={styles.commentBody}>{refined ? <>핵심을 정리해서 말하면<br />더 이해하기 좋을 것 같아요!</> : <>존나 두서없이<br />하고싶은 말만 하네</>}</p>
      {refined ? (
        <div className={styles.sourceRow}>
          <details className={styles.source}>
            <summary>원문 보기 <CaretDown aria-hidden="true" /></summary>
            <div className={styles.sourcePanel}><strong>원문 · 거친 표현 포함</strong><p>존나 두서없이 하고싶은 말만 하네</p></div>
          </details>
          <span className={styles.warning}><Info aria-hidden="true" />거친 표현 포함</span>
        </div>
      ) : <span className={styles.badge}>거친 표현 · 개선 의견 포함</span>}
      <div className={styles.commentActions}>
        <button type="button" aria-label="좋아요" aria-pressed={reaction === "like"} onClick={() => setReaction(reaction === "like" ? null : "like")}><ThumbsUp weight={reaction === "like" ? "fill" : "regular"} /></button>
        <button type="button" aria-label="싫어요" aria-pressed={reaction === "dislike"} onClick={() => setReaction(reaction === "dislike" ? null : "dislike")}><ThumbsDown weight={reaction === "dislike" ? "fill" : "regular"} /></button>
        <button type="button" aria-expanded={replyOpen} onClick={() => setReplyOpen(!replyOpen)}><ChatText aria-hidden="true" />답글</button>
      </div>
      {replyOpen && <p role="status" className={styles.replyNote}>예시 댓글이에요. 실제 답글은 채널 연결 후 작성할 수 있어요.</p>}
    </article>
  );
}
