"use client";

import { X } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef } from "react";

import { BrandLogo } from "@/features/brand/brand-logo";
import styles from "./landing.module.css";

export function LandingHeader() {
  const guide = useRef<HTMLDialogElement>(null);

  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="CrowdSift 홈">
          <BrandLogo />
          <strong>CrowdSift</strong>
        </Link>
        <nav aria-label="제품 소개" className={styles.navigation}>
          <button type="button" onClick={() => guide.current?.showModal()}>이용 방법</button>
          <Link href="/auth/sign-in">로그인</Link>
          <Link className={styles.start} href="/auth/sign-in">시작하기</Link>
        </nav>
      </header>
      <dialog ref={guide} className={styles.dialog} aria-labelledby="guide-title" onClick={(event) => {
        if (event.target === event.currentTarget) guide.current?.close();
      }}>
        <button className={styles.close} type="button" aria-label="이용 방법 닫기" onClick={() => guide.current?.close()}><X aria-hidden="true" size={22} /></button>
        <h2 id="guide-title">시프티와 함께 댓글을 살펴봐요.</h2>
        <ol>
          <li><strong>YouTube 채널 연결</strong><p>로그인 후 내 채널을 연결하고, 댓글을 가져올 시작 날짜를 선택해요.</p></li>
          <li><strong>필요한 의견 확인</strong><p>Comment Inbox에서 분류된 댓글과 시프티가 정리한 피드백을 확인해요.</p></li>
          <li><strong>최종 결정은 직접</strong><p>필요할 때 원문을 펼쳐 보고, 실제 조치는 확인 후 실행해요.</p></li>
        </ol>
        <Link className={styles.connect} href="/auth/sign-in?next=%2Fapp%2Fconnect%2Fyoutube">내 채널 연결하기</Link>
      </dialog>
    </>
  );
}
