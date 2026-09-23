import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { useAutomaticScoring } from './useAutomaticScoring';
const mocks=vi.hoisted(()=>({run:vi.fn(async()=>({ok:true,scored:1}))}));
vi.mock('@/data/store',()=>({rescoreVacancy:(...a)=>mocks.run(...a)}));
const position={id:'p',requirements:{requiredSkills:['Java']}};
const a={id:'a',positionId:'p',stage:'applied'};
function Harness({apps,enabled=true}) {useAutomaticScoring(position,apps,new Map(),enabled);return null;}
beforeEach(()=>{vi.useFakeTimers();mocks.run.mockClear();});
afterEach(()=>vi.useRealTimers());
it('scores on opening and picks up arrivals without reprocessing previous candidates',async()=>{
 let tree;act(()=>{tree=create(<Harness apps={[a]}/>);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(600);});expect(mocks.run).toHaveBeenCalledWith('p',{applicationIds:['a']});
 act(()=>tree.update(<Harness apps={[a,{...a,id:'b'},{...a,id:'later',stage:'interview'}]}/>));
 await act(async()=>{await vi.advanceTimersByTimeAsync(600);});expect(mocks.run).toHaveBeenLastCalledWith('p',{applicationIds:['b']});expect(mocks.run).toHaveBeenCalledTimes(2);
 act(()=>tree.unmount());
});
it('does not score without HR access',async()=>{let tree;act(()=>{tree=create(<Harness apps={[a]} enabled={false}/>);});await act(async()=>{await vi.advanceTimersByTimeAsync(600);});expect(mocks.run).not.toHaveBeenCalled();act(()=>tree.unmount());});
