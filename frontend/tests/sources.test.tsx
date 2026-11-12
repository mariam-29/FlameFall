import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';

const source = {
  id: 'SRC_TEST',
  publisher: 'NASA',
  title: 'Flame Fall test publication',
  url: 'https://example.org/paper',
  doi_or_ntrs_id: 'NTRS TEST-1',
  version: '1',
  accessed_date: '2026-11-01',
  reuse_terms: 'Public domain',
};

const manifest = {
  catalog_version: 'test-version',
  sha256_hash: 'test-hash',
  counts: { sources: 1 },
  sources: { SRC_TEST: source },
  evidence_locators: {},
  exclusions: [],
};

const evaluation = {
  catalog_version: 'test-version',
  ranked_investigations: [],
  applicability: {},
  evidence_drawers: {
    SRC_TEST: [{
      evidence_id: 'EV_TEST_1',
      source_title: source.title,
      source_url: source.url,
      locator_detail: 'Table 1',
    }],
  },
};

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  } as Response;
}

function mockApi(options: {
  manifest?: () => Promise<Response> | Response;
  evaluate?: () => Promise<Response> | Response;
}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = new URL(String(input), 'https://frontend.test').pathname;
    if (path === '/api/export/manifest') return options.manifest?.() ?? response(manifest);
    if (path === '/api/evaluate') return options.evaluate?.() ?? response(evaluation);
    throw new Error(`Unexpected API request: ${path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderSources() {
  return render(<MemoryRouter initialEntries={['/sources']}><App/></MemoryRouter>);
}

function mockRouteApi() {
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
    const path=new URL(String(input),'https://frontend.test').pathname;
    if(path==='/api/health')return response({status:'ok',catalog_version:'test-version',sha256_hash:'test-hash',generated_at:'2026-11-01T00:00:00Z',counts:{sources:1},ai_mode_configured:'reviewed_fallback_only',exports:{}});
    if(path==='/api/export/manifest')return response(manifest);
    if(path==='/api/evaluate')return response({...evaluation,filtered_runs:[],phases:[],run_comparison:{status:'not_compared',reason:'Choose two different runs.'}});
    throw new Error(`Unexpected API request: ${path}`);
  }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Sources & Evidence independent API resources', () => {
  it('renders sources and evidence when both requests succeed', async () => {
    const fetchMock=mockApi({});
    renderSources();

    expect(await screen.findByRole('heading', { name: source.title })).toBeTruthy();
    expect(await screen.findByRole('button', { name: /EV_TEST_1/ })).toBeTruthy();
    expect(screen.getByText('1 source')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: /Open publication/ }).getAttribute('rel')).toContain('noopener');
  });

  it('keeps the manifest loading state independent from already-loaded evidence', async () => {
    let resolveManifest!: (value:Response)=>void;
    const manifestPromise=new Promise<Response>(resolve=>{resolveManifest=resolve;});
    mockApi({manifest:()=>manifestPromise});
    renderSources();

    expect(screen.getByText('Loading source manifest…')).toBeTruthy();
    expect(await screen.findByRole('button',{name:/EV_TEST_1/})).toBeTruthy();
    await act(async()=>{resolveManifest(response(manifest));});
    expect(await screen.findByRole('heading',{name:source.title})).toBeTruthy();
  });

  it('keeps evidence visible when the manifest request fails', async () => {
    mockApi({ manifest: () => response({ error: 'Manifest route unavailable' }, 404) });
    renderSources();

    expect(await screen.findByText(/Manifest route unavailable/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /EV_TEST_1/ })).toBeTruthy();
    expect(screen.getByText('Sources unavailable')).toBeTruthy();
    expect(screen.queryByText('0 sources')).toBeNull();
  });

  it('turns browser network/CORS failures into an actionable message', async () => {
    mockApi({ manifest: () => Promise.reject(new TypeError('Failed to fetch')) });
    renderSources();

    expect(await screen.findByText(/Check VITE_API_BASE_URL, CORS, and backend availability/)).toBeTruthy();
    expect(await screen.findByRole('button', { name: /EV_TEST_1/ })).toBeTruthy();
  });

  it('times out a stalled resource request with a retryable message', async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{
      const path=new URL(String(input),'https://frontend.test').pathname;
      if(path==='/api/evaluate')return Promise.resolve(response(evaluation));
      return new Promise<Response>((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>{
        const error=new Error('Aborted');error.name='AbortError';reject(error);
      },{once:true}));
    });
    vi.stubGlobal('fetch',fetchMock);
    renderSources();
    await act(async()=>{await vi.advanceTimersByTimeAsync(20000);});

    expect(screen.getByText(/timed out after 20 seconds/)).toBeTruthy();
    expect(screen.getByRole('button',{name:'Retry sources'})).toBeTruthy();
  });

  it('keeps sources visible when evaluation fails', async () => {
    mockApi({ evaluate: () => response({ error: 'Evaluation is temporarily unavailable' }, 503) });
    renderSources();

    expect(await screen.findByRole('heading', { name: source.title })).toBeTruthy();
    expect(await screen.findByText(/Evaluation is temporarily unavailable/)).toBeTruthy();
    expect(screen.getByText('1 source')).toBeTruthy();
  });

  it('shows separate actionable errors when both requests fail', async () => {
    mockApi({
      manifest: () => response({ error: 'Manifest unavailable' }, 503),
      evaluate: () => response({ error: 'Evaluation unavailable' }, 503),
    });
    renderSources();

    expect(await screen.findByRole('button', { name: 'Retry sources' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry evidence' })).toBeTruthy();
    expect(screen.getByText('Sources unavailable')).toBeTruthy();
  });

  it('filters source records case-insensitively by title and source metadata', async () => {
    mockApi({ manifest: () => response({ ...manifest, sources: {
      SRC_TEST: source,
      SRC_OTHER: { ...source, id: 'SRC_OTHER', title: 'Microgravity airflow study', doi_or_ntrs_id: 'DOI-OTHER' },
    } }) });
    renderSources();

    const search = await screen.findByRole('textbox', { name: 'Search sources' });
    await userEvent.type(search, 'test-1');
    expect(screen.getByRole('heading', { name: source.title })).toBeTruthy();
    expect(screen.queryByText('Microgravity airflow study')).toBeNull();
    expect(screen.getByText('1 source')).toBeTruthy();
  });

  it('shows a genuine empty state only for a successfully loaded empty manifest', async () => {
    mockApi({ manifest: () => response({ ...manifest, counts: { sources: 0 }, sources: {} }) });
    renderSources();

    expect(await screen.findByRole('heading', { name: 'No sources are available in this catalog.' })).toBeTruthy();
    expect(screen.getByText('0 sources')).toBeTruthy();
  });

  it('retries a failed manifest request and renders sources after recovery', async () => {
    let attempts = 0;
    mockApi({ manifest: () => ++attempts === 1 ? response({ error: 'Temporary failure' }, 503) : response(manifest) });
    renderSources();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry sources' }));
    expect(await screen.findByRole('heading', { name: source.title })).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 source')).toBeTruthy());
    expect(attempts).toBe(2);
  });

  it('opens and safely closes evidence details', async () => {
    mockApi({});
    renderSources();

    await userEvent.click(await screen.findByRole('button', { name: /EV_TEST_1/ }));
    expect(await screen.findByRole('dialog', { name: 'EV_TEST_1' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open original publication/ }).getAttribute('rel')).toContain('noopener');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Frontend route regression',()=>{
  it.each([
    ['/', /Explore fire\s*research in space\./],
    ['/explore', 'Explore the evidence.'],
    ['/runs', 'Explore reviewed runs.'],
    ['/compare', 'Compare reviewed runs.'],
    ['/sources', 'Sources & evidence.'],
    ['/about', 'About this collection.'],
  ])('renders %s on direct route load',async(path,title)=>{
    mockRouteApi();
    render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);
    expect(await screen.findByRole('heading',{name:title})).toBeTruthy();
  });

  it('navigates between the primary workspace routes',async()=>{
    mockRouteApi();
    render(<MemoryRouter initialEntries={['/']}><App/></MemoryRouter>);
    expect(await screen.findByRole('heading',{name:/Explore fire\s*research in space\./})).toBeTruthy();
    await userEvent.click(screen.getByRole('link',{name:'Explore',exact:true}));
    expect(await screen.findByRole('heading',{name:'Explore the evidence.'})).toBeTruthy();
    await userEvent.click(screen.getByRole('link',{name:'Run explorer',exact:true}));
    expect(await screen.findByRole('heading',{name:'Explore reviewed runs.'})).toBeTruthy();
    await userEvent.click(screen.getByRole('link',{name:'Compare runs',exact:true}));
    expect(await screen.findByRole('heading',{name:'Compare reviewed runs.'})).toBeTruthy();
    await userEvent.click(screen.getByRole('link',{name:'Sources',exact:true}));
    expect(await screen.findByRole('heading',{name:'Sources & evidence.'})).toBeTruthy();
    await userEvent.click(screen.getByRole('link',{name:'About the data',exact:true}));
    expect(await screen.findByRole('heading',{name:'About this collection.'})).toBeTruthy();
  });

  it('validates and submits a scenario, then requests its grounded explanation',async()=>{
    const evaluated={...evaluation,counts:{investigations:1,verified_runs:1},resolved_scenario:{scenario_state:'specified'},ranked_investigations:[{investigation_id:'INV_TEST',title:'Test investigation',study_relevance_score:88,research_lead:{finding:'Reviewed finding',limitation:'Limited to tested conditions'},data_depth:'verified',reviewed_run_count:1,published_run_count:1,matching_conditions:[],missing_or_mismatched_conditions:[]}],applicability:{rows:[]}};
    const explained={catalog_version:'test-version',ranked_investigations:[],applicability:{},explanation:{observed_findings:[],applicability_limits:[],missing_evidence:[]},citations:[],mode:'reviewed_fallback',provider_mode_detail:'deterministic'};
    const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
      const path=new URL(String(input),'https://frontend.test').pathname;
      if(path==='/api/evaluate')return response(evaluated);
      if(path==='/api/explain')return response(explained);
      throw new Error(`Unexpected API request: ${path}`);
    });
    vi.stubGlobal('fetch',fetchMock);
    render(<MemoryRouter initialEntries={['/explore']}><App/></MemoryRouter>);

    await userEvent.selectOptions(screen.getByLabelText('Preset'),'iss_acrylic_experiment');
    await userEvent.click(screen.getByRole('button',{name:/Evaluate evidence/}));
    expect(await screen.findByRole('heading',{name:'Test investigation'})).toBeTruthy();
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
    const evaluateBody=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const explainBody=JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(evaluateBody.scenario.preset).toBe('iss_acrylic_experiment');
    expect(explainBody.catalog_version).toBe('test-version');
  });
});
