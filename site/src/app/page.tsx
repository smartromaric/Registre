import { Header } from "@/components/Header";
import { SmoothScroll } from "@/components/SmoothScroll";
import { Hero } from "@/components/hero/Hero";
import { Deadline } from "@/components/sections/Deadline";
import { FinalCta } from "@/components/sections/FinalCta";
import { Footer } from "@/components/sections/Footer";
import { Migration } from "@/components/sections/Migration";
import { Offline } from "@/components/sections/Offline";
import { Pillars } from "@/components/sections/Pillars";
import { Pricing } from "@/components/sections/Pricing";
import { Problem } from "@/components/sections/Problem";
import { Security } from "@/components/sections/Security";
import { Templates } from "@/components/sections/Templates";

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <Header />
      <main>
        <Hero />
        <Problem />
        <Pillars />
        <Deadline />
        <Templates />
        <Offline />
        <Migration />
        <Security />
        <Pricing />
        <FinalCta />
      </main>
      {/* Hors de <main> : sinon le rôle `contentinfo` n'est pas porté (playbook §6). */}
      <Footer />
    </>
  );
}
