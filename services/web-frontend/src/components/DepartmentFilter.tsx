'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface Department {
  name: string;
  id: string | null;
}

const DEPARTMENTS: Department[] = [
  { name: 'All', id: null },
  { name: 'FENS', id: 'FENS' },
  { name: 'FASS', id: 'FASS' },
  { name: 'SBS', id: 'SBS' },
  { name: 'SL', id: 'SL' },
];

export default function DepartmentFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentDept = searchParams.get('dept');

  const handleFilterClick = (deptId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (deptId) {
      params.set('dept', deptId);
    } else {
      params.delete('dept');
    }
    // Reset page to 1 when changing filter
    params.set('page', '1');
    router.push(`/?${params.toString()}`);
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      gap: '1rem', 
      margin: '2rem 0',
      flexWrap: 'wrap'
    }}>
      {DEPARTMENTS.map((dept) => {
        const isActive = (dept.id === null && !currentDept) || (dept.id === currentDept);
        return (
          <button
            key={dept.name}
            onClick={() => handleFilterClick(dept.id)}
            style={{
              padding: '0.5rem 1.5rem',
              borderRadius: '2rem',
              border: '2px solid #002855',
              backgroundColor: isActive ? '#002855' : 'transparent',
              color: isActive ? 'white' : '#002855',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontSize: '0.9rem',
              outline: 'none'
            }}
            onMouseOver={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = '#002855';
                e.currentTarget.style.color = 'white';
              }
            }}
            onMouseOut={(e) => {
              if (!isActive) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = '#002855';
              }
            }}
          >
            {dept.name}
          </button>
        );
      })}
    </div>
  );
}
