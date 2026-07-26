'use client';

import { useEffect } from 'react';
import { scene, setSection } from '@/lib/scene-state';
import { clamp } from '@/lib/utils';

/**
 * Maps scroll position onto the section sequence.
 *
 * This is the bridge between "where the document is" and "where the camera
 * should be". It exists because the obvious approach — feeding the camera a
 * 0→1 scroll fraction — is wrong the moment sections differ in height, which
 * they do by a factor of three here. A keyframe composed for the pricing
 * section would fire somewhere in the middle of the validation table.
 *
 * Instead each section gets an *anchor*: the scroll offset at which that
 * section is centred in the viewport. `sectionFloat` then interpolates between
 * consecutive anchors, so keyframe N is reached exactly when section N is
 * centred, whatever its height.
 *
 * Renders nothing.
 */
export function SectionTracker() {
  useEffect(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>('[data-section]'),
    );
    if (elements.length === 0) return;

    /** Scroll offset at which each section sits centred in the viewport. */
    let anchors: number[] = [];

    const measure = () => {
      const viewport = window.innerHeight;
      const maxScroll = Math.max(
        1,
        document.documentElement.scrollHeight - viewport,
      );

      anchors = elements.map((el) => {
        const rect = el.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        return clamp(top + rect.height / 2 - viewport / 2, 0, maxScroll);
      });

      // Anchors must be strictly increasing for the search below. A very tall
      // section clamped against the document ends can otherwise tie with its
      // neighbour and produce a divide-by-zero.
      for (let i = 1; i < anchors.length; i++) {
        if (anchors[i] <= anchors[i - 1]) anchors[i] = anchors[i - 1] + 1;
      }
    };

    const update = () => {
      if (anchors.length === 0) return;
      const y = window.scrollY;

      let index = 0;
      while (index < anchors.length - 2 && y >= anchors[index + 1]) index++;

      const a = anchors[index];
      const b = anchors[index + 1] ?? a + 1;
      const t = clamp((y - a) / (b - a), 0, 1);

      scene.sectionFloat = index + t;

      // The "active" section for UI purposes is whichever anchor is nearest,
      // which is what the rail and nav highlight should follow.
      const nearest = t < 0.5 ? index : index + 1;
      setSection(Math.min(elements.length - 1, nearest), t);
    };

    const onScroll = () => update();
    const onResize = () => {
      measure();
      update();
    };

    measure();
    update();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    // Section heights settle after fonts load and images decode; re-measuring
    // once the page is fully idle avoids anchors computed against a shorter
    // provisional layout.
    const settle = window.setTimeout(onResize, 1200);
    if (document.fonts?.ready) document.fonts.ready.then(onResize).catch(() => {});

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.clearTimeout(settle);
    };
  }, []);

  return null;
}
