import Link from "next/link";
import React from "react";

// Ambient `UpdatesCardProps` comes from types/updates.d.ts.
const UpdatesCard = ({ id, slug, title, date, content, topic, tags }: UpdatesCardProps) => (
  <article
    aria-labelledby={`update-${id}`}
    className="lift flex flex-col gap-4 rounded-[20px] border border-bBORDERFADE bg-bCARD p-6 s640:p-8"
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="rounded-full bg-bICON_FADE px-3 py-1 text-xs font-semibold text-bICON">
        {topic}
      </span>
      <span className="text-sm tabular-nums opacity-70">{date}</span>
    </div>

    <div>
      <h3
        id={`update-${id}`}
        className="text-balance text-xl font-semibold leading-snug s768:text-2xl"
      >
        <Link href={`/updates/${slug}`} className="hover:underline">
          {title}
        </Link>
      </h3>
      <p className="mt-3 max-w-[70ch] text-[15px] leading-relaxed opacity-80 s768:text-base">
        {content}
      </p>
    </div>

    {tags.length > 0 && (
      <ul className="flex flex-wrap gap-2" aria-label="Tags">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded-full border border-bBORDERFADE bg-bCHIP px-3 py-1 text-xs font-medium"
          >
            {tag}
          </li>
        ))}
      </ul>
    )}
  </article>
);

export default UpdatesCard;
