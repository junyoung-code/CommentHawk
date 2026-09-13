import Image from "next/image";

import crowdsiftLogo from "../../../public/brand/crowdsift-logo.png";

export function BrandLogo() {
  return (
    <Image
      className="crowdsift-logo"
      src={crowdsiftLogo}
      alt=""
      width={1254}
      height={1254}
    />
  );
}
