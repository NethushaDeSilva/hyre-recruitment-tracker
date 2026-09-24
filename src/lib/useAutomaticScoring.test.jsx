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
it('retries a failed batch on its own, with no manual Retry click',async()=>{
 mocks.run.mockResolvedValueOnce({ok:false,error:'rate limited'}).mockResolvedValueOnce({ok:true,scored:1});
 let tree;act(()=>{tree=create(<Harness apps={[a]}/>);});
 await act(async()=>{await vi.advanceTimersByTimeAsync(600);});
 expect(mocks.run).toHaveBeenCalledTimes(1); // first attempt failed
 // One unattended cycle is AUTO_RETRY_DELAY_MS + the 500ms batch debounce,
 // plus a React flush for the revision bump that re-arms the effect — pumped
 // in steps because the re-armed timer is only created once act() settles.
 for(let i=0;i<6;i++) await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
 expect(mocks.run).toHaveBeenCalledTimes(2); // retried itself, unattended
 act(()=>tree.unmount());
});
it('gives up after AUTO_RETRY_LIMIT and leaves the manual Retry path intact',async()=>{
 mocks.run.mockResolvedValue({ok:false,error:'still failing'});
 let tree;act(()=>{tree=create(<Harness apps={[a]}/>);});
 // Same pumping as above, long enough to cover all three retry cycles and
 // then some — the point is that it STOPS at the limit, not that it is slow.
 for(let i=0;i<30;i++) await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});
 // 1 initial + AUTO_RETRY_LIMIT(3) auto-retries = 4 attempts, then it stops on its own
 expect(mocks.run).toHaveBeenCalledTimes(4);
 act(()=>tree.unmount());
});
