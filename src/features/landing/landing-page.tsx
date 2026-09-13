import { YoutubeLogo } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";

import { LandingHeader } from "./landing-header";
import { LandingComment } from "./landing-comment";
import styles from "./landing.module.css";

export function LandingPage() {
  return (
    <main className={styles.page}>
      <LandingHeader />
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.intro}>
          <h1 id="landing-title">
            거친 말 속에서도,<br />
            <span>도움 되는 의견만 또렷하게.</span>
          </h1>
          <p>시프티가 표현을 정리하고, 필요한 피드백을 남겨요.</p>
          <Link className={styles.connect} href="/auth/sign-in?next=%2Fapp%2Fconnect%2Fyoutube">
            <YoutubeLogo weight="fill" aria-hidden="true" />
            YouTube 연결하기
          </Link>
        </div>
        <div className={styles.scene} role="region" aria-label="댓글 정리 예시">
          <Image
            className={styles.sceneImage}
            src="/brand/shifty-landing-scene-neutral.png"
            width={1884}
            height={835}
            sizes="(max-width: 760px) 100vw, (max-width: 1477px) 100vw, 1477px"
            preload
            alt="정장을 입은 시프티가 원문 댓글과 정리된 피드백 트레이 사이에서 댓글을 살펴보고 있어요."
          />
          <p className={styles.legend}>
            <Image src="/brand/shifty-owl-profile.png" width={32} height={32} alt="" />
            <span>이 이미지는 시프티가 표현을<br />정리했다는 뜻이에요!</span>
          </p>
          <LandingComment variant="original" />
          <LandingComment variant="refined" />
          <Image
            className={styles.foregroundWing}
            src="/brand/shifty-landing-scene-neutral.png"
            width={1884}
            height={835}
            sizes="(max-width: 1477px) 100vw, 1477px"
            alt=""
            aria-hidden="true"
          />
          <Image
            className={styles.foregroundTrays}
            src="/brand/shifty-landing-scene-neutral.png"
            width={1884}
            height={835}
            sizes="(max-width: 1477px) 100vw, 1477px"
            alt=""
            aria-hidden="true"
          />
          <p className={styles.deskNote}>원문은 보존하고, 실제 조치는 확인 후 실행해요.</p>
          <div className={styles.trayLabels}>
            <p className={`${styles.trayLabel} ${styles.originalLabel}`}>원문 댓글</p>
            <p className={`${styles.trayLabel} ${styles.refinedLabel}`}>정리된 피드백</p>
          </div>
        </div>
      </section>
      <footer className={styles.footer}>
        <small>댓글 예시 · 실제 사용자 데이터가 아닙니다</small>
      </footer>
    </main>
  );
}
