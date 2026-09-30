import medal1 from '@/assets/model-rank-medals/rank-1.png';
import medal2 from '@/assets/model-rank-medals/rank-2.png';
import medal3 from '@/assets/model-rank-medals/rank-3.png';

interface RankMedalProps {
  rank: number;
  className?: string;
}

const MEDALS: Record<number, { src: string; alt: string }> = {
  1: { src: medal1, alt: '1st Place Gold Medal' },
  2: { src: medal2, alt: '2nd Place Silver Medal' },
  3: { src: medal3, alt: '3rd Place Bronze Medal' },
};

export function RankMedal({ rank, className = 'h-8 w-8' }: RankMedalProps) {
  const medal = MEDALS[rank];
  if (!medal) return null;

  return (
    <img
      src={medal.src}
      alt={medal.alt}
      className={`${className} shrink-0 object-contain drop-shadow-sm select-none`}
      loading="eager"
      decoding="async"
    />
  );
}
