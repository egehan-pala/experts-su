'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell
} from 'recharts';

interface YearlyMetric {
  year: number;
  pub_count: number;
  citations: number;
}

interface Publication {
  id: string;
  title: string;
  year: number | null;
  citations: number | null;
  venue: string | null;
  pdf_url?: string | null;
  publication_date?: string | null;
}

interface Props {
  authorId: string;
  data: YearlyMetric[];
}

const SABANCI_BLUE = '#002855';
const SABANCI_RED = '#d6001c';

export default function CitationTimelineChart({ authorId, data }: Props) {
  const [range, setRange] = useState<number | 'all'>(10);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [topPaper, setTopPaper] = useState<Publication | null>(null);
  const [paperLoading, setPaperLoading] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const filteredData = useMemo(() => {
    if (!data) return [];
    if (range === 'all') return data;
    const currentYear = new Date().getFullYear();
    return data.filter(d => d.year > currentYear - (range as number));
  }, [data, range]);

  const { chartData, maxPubs, maxCits } = useMemo(() => {
    if (!filteredData || filteredData.length === 0) {
      return { chartData: [], maxPubs: 1, maxCits: 1 };
    }
    const mP = Math.max(...filteredData.map(d => d.pub_count || 0), 1);
    const mC = Math.max(...filteredData.map(d => d.citations || 0), 1);

    const cD = filteredData.map(d => ({
      ...d,
      displayCitations: d.citations || 0,
      citationsMirrored: -(d.citations || 0)
    }));

    return { chartData: cD, maxPubs: mP, maxCits: mC };
  }, [filteredData]);

  useEffect(() => {
    if (selectedYear) {
      setPaperLoading(true);
      const shortId = authorId.replace('https://openalex.org/', '').split('/').pop() || authorId;
      fetch(`http://localhost:8000/authors/${shortId}/top-publication-by-year?year=${selectedYear}`)
        .then(res => res.json())
        .then(json => {
          setTopPaper(json);
          setPaperLoading(false);
        })
        .catch(err => {
          console.error('Error fetching top paper:', err);
          setPaperLoading(false);
        });
    }
  }, [selectedYear, authorId]);

  const selectedYearData = useMemo(() => {
    return data.find(d => d.year === selectedYear);
  }, [data, selectedYear]);

  // Prevent hydration mismatch by returning a placeholder of the same size
  if (!isMounted) return <div style={{ height: 450, width: '100%', backgroundColor: '#fff' }} />;
  if (!data || data.length === 0) return null;

  return (
    <div className="citation-timeline-container" style={{
      padding: '3rem 0',
      backgroundColor: '#1e293b',
      borderBottom: '1px solid #e4e4e7',
      width: '100%'
    }}>
      <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 5vw', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', margin: 0, fontFamily: 'var(--font-serif)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Publications & Citations Timeline
            </h3>
            <p style={{ fontSize: '0.9rem', color: '#fff', marginTop: '0.5rem' }}>
              Bilateral view: Publications (↑) vs. Citations (↓). Click a year below to see impact details.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>View:</span>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              style={{
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                border: '1px solid #d4d4d8',
                backgroundColor: '#fff',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#3f3f46',
                cursor: 'pointer',
                outline: 'none',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
              }}
            >
              <option value={10}>Last 10 Years</option>
              <option value={20}>Last 20 Years</option>
              <option value="all">All Years</option>
            </select>
          </div>
        </div>

        <div style={{
          width: '100%',
          height: 400,
          backgroundColor: '#fcfcfc',
          borderRadius: '12px',
          padding: '1rem',
          border: '1px solid #f1f5f9',
          boxSizing: 'border-box',
          position: 'relative'
        }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              stackOffset="sign"
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={(e: any) => {
                if (e && e.activePayload) {
                  setSelectedYear(e.activePayload[0].payload.year);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="year"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#64748b', fontWeight: 500 }}
                dy={10}
              />
              {/* Publication Axis (Left) */}
              <YAxis
                yAxisId="pubs"
                orientation="left"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: SABANCI_BLUE, fontWeight: 700 }}
                domain={[Math.floor(-maxPubs * 1.2), Math.ceil(maxPubs * 1.2)]}
                allowDecimals={false}
                hide={false}
                label={{ value: 'Pubs', angle: -90, position: 'insideLeft', offset: -5, fill: SABANCI_BLUE, fontSize: 12, fontWeight: 800 }}
                tickFormatter={(val) => val > 0 ? val.toFixed(0) : ''}
              />
              {/* Citation Axis (Right) */}
              <YAxis
                yAxisId="cits"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: SABANCI_RED, fontWeight: 700 }}
                domain={[Math.floor(-maxCits * 1.2), Math.ceil(maxCits * 1.2)]}
                allowDecimals={false}
                hide={false}
                label={{ value: 'Citations', angle: 90, position: 'insideRight', offset: -5, fill: SABANCI_RED, fontSize: 12, fontWeight: 800 }}
                tickFormatter={(val) => val < 0 ? Math.abs(val).toFixed(0) : ''}
              />
              <Tooltip
                cursor={{ fill: '#f8fafc' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div style={{
                        backgroundColor: '#fff',
                        padding: '16px',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                        minWidth: '200px'
                      }}>
                        <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: '12px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px', fontSize: '1rem' }}>
                          Year {d.year}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: SABANCI_BLUE }} />
                          <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Publications:</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#002855', marginLeft: 'auto' }}>
                            {d.pub_count}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: 10, height: 10, borderRadius: '2px', backgroundColor: SABANCI_RED }} />
                          <span style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 500 }}>Citations:</span>
                          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#d6001c', marginLeft: 'auto' }}>
                            {d.displayCitations}
                          </span>
                        </div>
                        <div style={{ marginTop: '12px', padding: '6px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: '#3b82f6', fontWeight: 700, textAlign: 'center' }}>
                          CLICK BAR TO SEE TOP PAPER
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="rect"
                wrapperStyle={{ paddingBottom: '30px', fontWeight: 600, fontSize: '0.85rem' }}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={2} />
              <Bar
                yAxisId="pubs"
                dataKey="pub_count"
                name="Publications"
                fill={SABANCI_BLUE}
                radius={[4, 4, 0, 0]}
                barSize={32}
                animationDuration={1500}
                style={{ cursor: 'pointer' }}
                onClick={(data: any) => setSelectedYear(data.year)}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-pub-${index}`}
                    fill={entry.year === selectedYear ? '#3b82f6' : SABANCI_BLUE}
                    style={{ transition: 'fill 0.3s ease' }}
                  />
                ))}
              </Bar>
              <Bar
                yAxisId="cits"
                dataKey="citationsMirrored"
                name="Citations"
                fill={SABANCI_RED}
                radius={[0, 0, 4, 4]}
                barSize={32}
                animationDuration={1500}
                style={{ cursor: 'pointer' }}
                onClick={(data: any) => setSelectedYear(data.year)}
              >
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-cit-${index}`}
                    fill={entry.year === selectedYear ? '#ef4444' : SABANCI_RED}
                    style={{ transition: 'fill 0.3s ease' }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Selected Year Detail Panel */}
        {selectedYear && (
          <div id="year-detail-panel" style={{
            marginTop: '2rem',
            padding: '2rem',
            backgroundColor: '#f8fafc',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            animation: 'slideUp 0.4s ease-out'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '2rem' }}>
              <div style={{ flex: '1 1 300px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <div style={{
                    backgroundColor: '#002855',
                    color: '#fff',
                    padding: '0.5rem 1rem',
                    borderRadius: '8px',
                    fontWeight: 800,
                    fontSize: '1.25rem'
                  }}>
                    {selectedYear}
                  </div>
                  <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Year Summary</h4>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Publications</span>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#002855', marginTop: '0.5rem' }}>
                      {selectedYearData?.pub_count || 0}
                    </div>
                  </div>
                  <div style={{ backgroundColor: '#fff', padding: '1.25rem', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Citations</span>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#d6001c', marginTop: '0.5rem' }}>
                      {selectedYearData?.citations || 0}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ flex: '1.5 1 400px', backgroundColor: '#fff', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', position: 'relative', minHeight: '180px' }}>
                <h4 style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  MOST CITED PAPER IN {selectedYear}
                </h4>

                {paperLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', color: '#94a3b8' }}>Retrieving top record...</div>
                ) : topPaper ? (
                  <div>
                    <a
                      href={topPaper.pdf_url || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="top-paper-link"
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: '#002855',
                        textDecoration: 'none',
                        lineHeight: 1.4,
                        display: 'block',
                        marginBottom: '0.75rem'
                      }}
                    >
                      {topPaper.title} ↗
                    </a>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: '#64748b' }}>
                      <span style={{ fontWeight: 600 }}>{topPaper.venue}</span>
                      <span>•</span>
                      <span style={{ color: '#d6001c', fontWeight: 700 }}>{topPaper.citations} Citations</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.9rem', textAlign: 'center', paddingTop: '2rem' }}>No publication records found for this year in the database.</div>
                )}
              </div>
            </div>
            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button
                onClick={() => setSelectedYear(null)}
                style={{ fontSize: '0.85rem', color: '#64748b', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
              >
                Close Summary
              </button>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .top-paper-link:hover {
          color: #d6001c !important;
          text-decoration: underline !important;
        }
      `}} />
    </div>
  );
}
