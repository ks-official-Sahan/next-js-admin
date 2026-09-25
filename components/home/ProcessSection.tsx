import HomeSection from "@/components/home/HomeSection";
import SectionHeading from "@/components/home/SectionHeading";
import type { PageContent } from "@/lib/cms/registry";
import React from "react";

// A real sequence, so the numbers carry information (order matters here).
// Phones and tablets read it as a vertical timeline; from 1024px the steps sit
// in a row joined by a rule, so the whole process is visible at a glance.

interface ProcessSectionProps {
  content: PageContent<"home">["process"];
  labels: PageContent<"home">["home"];
}

const ProcessSection = ({ content, labels: home }: ProcessSectionProps) => {
  const { steps } = content;

  return (
    <HomeSection id="process" labelledBy="process-title" band>
      <SectionHeading
        id="process-title"
        title={home.process.title}
        description={home.process.subtitle}
      />

      <ol className="mt-12 grid grid-cols-1 gap-0 lg:grid-cols-4 lg:gap-6">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="reveal group relative pb-10 pl-14 last:pb-0 lg:pb-0 lg:pl-0 lg:pt-14"
          >
            <span
              aria-hidden="true"
              className="absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full border border-bBORDERFADE bg-bICON_FADE text-sm font-semibold tabular-nums text-bICON"
            >
              {index + 1}
            </span>
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-[17px] top-11 w-px bg-bBORDERFADE group-last:hidden lg:bottom-auto lg:left-11 lg:right-[-1.5rem] lg:top-[17px] lg:h-px lg:w-auto"
            />
            <h3 className="text-lg font-semibold leading-snug">{step.title}</h3>
            <p className="mt-2 max-w-[38ch] text-[15px] leading-relaxed opacity-70">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </HomeSection>
  );
};

export default ProcessSection;
