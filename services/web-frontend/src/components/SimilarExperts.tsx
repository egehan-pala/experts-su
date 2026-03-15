'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface SimilarAuthor {
  id: string;
  name: string;
  dept?: string;
  image_url?: string;
  shared_topics: string[];
  similarity_score: number;
}

interface SimilarExpertsProps {
  authorId: string;
}

const SimilarExperts: React.FC<SimilarExpertsProps> = ({ authorId }) => {
  const [similarAuthors, setSimilarAuthors] = useState<SimilarAuthor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSimilar = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/authors/${authorId}/similar`);
        const data = await res.json();
        setSimilarAuthors(data);
      } catch (error) {
        console.error('Error fetching similar experts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSimilar();
  }, [authorId]);

  if (loading) {
    return (
      <div className="mt-12 mb-8">
        <h2 className="text-2xl font-bold mb-6 text-slate-800 dark:text-slate-100">Similar Experts</h2>
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="min-w-[280px] h-[320px] bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (similarAuthors.length === 0) return null;

  return (
    <div className="mt-16 mb-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
            Similar Research Profiles
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Experts with overlapping research interests and publication subfields.
          </p>
        </div>
      </div>

      <div className="relative group">
        <div className="flex gap-6 overflow-x-auto pb-6 pt-2 scroll-smooth scrollbar-hide -mx-4 px-4 snap-x">
          {similarAuthors.map((expert) => (
            <Link 
              href={`/authors/${expert.id}`} 
              key={expert.id}
              className="min-w-[300px] max-w-[300px] snap-start bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col group/card"
            >
              <div className="relative h-40 overflow-hidden bg-slate-100 dark:bg-slate-800">
                {expert.image_url ? (
                  <img 
                    src={expert.image_url} 
                    alt={expert.name}
                    className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600">
                    <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                    </svg>
                  </div>
                )}
                <div className="absolute top-3 right-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur px-2.5 py-1 rounded-full text-xs font-bold text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-100 dark:border-indigo-900/50">
                  {Math.round(expert.similarity_score * 100)}% Match
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400 transition-colors line-clamp-1">
                  {expert.name}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {expert.dept || 'Research Expert'}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5 flex-1 content-start">
                  {expert.shared_topics.length > 0 ? (
                    expert.shared_topics.map((topic, idx) => (
                      <span 
                        key={idx}
                        className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 text-[10px] font-semibold rounded-md border border-indigo-100/50 dark:border-indigo-800/50"
                      >
                        {topic}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">No direct topic overlap</span>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center text-xs font-medium text-slate-400 group-hover/card:text-indigo-500 transition-colors">
                  View full profile
                  <svg className="w-3.5 h-3.5 ml-1 group-hover/card:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default SimilarExperts;
