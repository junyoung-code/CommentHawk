import Link from "next/link";

import { GoogleSignInButton } from "@/features/auth/google-sign-in-button";
import { getSafeNextPath } from "@/features/auth/safe-next-path";
import { BrandLogo } from "@/features/brand/brand-logo";

type SignInPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const parameters = await searchParams;
  const hasExpiredError = parameters.error === "expired";
  const nextPath = getSafeNextPath(parameters.next);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="sign-in-title">
        <Link className="auth-brand" href="/">
          <BrandLogo />
          CrowdSift
        </Link>
        <p className="auth-eyebrow">CREATOR SIGN IN</p>
        <h1 id="sign-in-title">CrowdSift에 로그인</h1>
        <p className="auth-description">
          Google 계정으로 간편하게 로그인합니다. 같은 브라우저에서는 직접
          로그아웃할 때까지 로그인 상태가 유지됩니다.
        </p>
        {hasExpiredError ? (
          <p className="form-message form-message-error" role="alert">
            로그인이 만료되었거나 유효하지 않습니다. Google로 다시 로그인해 주세요.
          </p>
        ) : null}
        <GoogleSignInButton nextPath={nextPath} />
        <div className="auth-separation-note">
          <strong>권한은 분리해서 관리합니다</strong>
          <p>
            YouTube 채널 권한은 로그인 후 별도로 연결하며, 댓글을 숨기거나
            삭제하는 권한은 필요한 순간에 다시 확인합니다.
          </p>
        </div>
      </section>
    </main>
  );
}
