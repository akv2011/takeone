// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Link } from 'react-router-dom';
import { PageMetadata } from '../src/seo/PageMetadata';
import { metadataFor, publicMetadata, siteUrl, structuredDataFor } from '../src/seo/metadata';
import { guides } from '../src/seo/guides';
import Guide from '../src/pages/Guide';
import Guides from '../src/pages/Guides';
afterEach(cleanup);
test('public routes have unique metadata and canonicals, private and unknown routes are noindex', () => {
 expect(new Set(Object.values(publicMetadata).map(p => p.title)).size).toBe(Object.keys(publicMetadata).length);
 for (const path of Object.keys(publicMetadata)) {
  expect(metadataFor(path).canonical).toBe(siteUrl + path);
  expect(metadataFor(path).robots).not.toContain('noindex');
 }
 for (const path of ['/create', '/studio/private-id', '/studio/project/private', '/review', '/unknown']) {
  expect(metadataFor(path).robots).toBe('noindex, nofollow');
  expect(metadataFor(path).canonical).toBeUndefined();
 }
});
test('navigation updates social metadata and removes public canonical/schema on private routes', async () => {
 render(<MemoryRouter><PageMetadata /><Link to="/guides/youtube-to-shorts">Guide</Link><Link to="/create">Workspace</Link></MemoryRouter>);
 fireEvent.click(screen.getByText('Guide'));
 await waitFor(() => expect(document.title).toContain('YouTube'));
 expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(siteUrl + '/guides/youtube-to-shorts');
 expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(document.title);
 expect(JSON.parse(document.getElementById('seo-schema')!.textContent!)[0]['@type']).toBe('BreadcrumbList');
 fireEvent.click(screen.getByText('Workspace'));
 await waitFor(() => expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, nofollow'));
 expect(document.querySelector('link[rel="canonical"]')).toBeNull();
 expect(JSON.parse(document.getElementById('seo-schema')!.textContent!)).toEqual([]);
});
test.each(guides)('guide $path has one heading, useful content and related links', guide => {
 render(<MemoryRouter initialEntries={[guide.path]}><Guide /></MemoryRouter>);
 expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
 expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(7);
 expect(screen.getByRole('link', { name: 'Explore the TakeOne workspace' }).getAttribute('href')).toBe('/create');
 for (const other of guides.filter(g => g.path !== guide.path)) expect(screen.getByRole('link', { name: other.title }).getAttribute('href')).toBe(other.path);
});
test('structured data makes no fabricated rating or active offer claims', () => {
 const json = JSON.stringify(structuredDataFor('/'));
 expect(json).toContain('WebSite'); expect(json).toContain('Organization');
 expect(json).not.toMatch(/aggregateRating|reviewCount|offers/);
});

test.each(guides)('guide $path exposes matching article identity and working section links', guide => {
 render(<MemoryRouter initialEntries={[guide.path]}><Guide /></MemoryRouter>);
 const article = structuredDataFor(guide.path).find(item => item['@type'] === 'Article');
 expect(article).toMatchObject({ headline: guide.title, mainEntityOfPage: siteUrl + guide.path, author: { name: 'TakeOne' } });
 expect(screen.getByText('By TakeOne')).toBeTruthy();
 for (const link of document.querySelectorAll('a[href^="#"]')) expect(document.getElementById(link.getAttribute('href')!.slice(1))).not.toBeNull();
 expect(screen.getByRole('heading', { name: 'Common questions' })).toBeTruthy();
});

test('trailing slash preserves schema identity and article social type', () => {
 for (const guide of guides) {
  expect(structuredDataFor(guide.path + '/')).toEqual(structuredDataFor(guide.path));
  expect(metadataFor(guide.path + '/').type).toBe('article');
 }
 expect(metadataFor('/missing').title).toBe('Page not found | TakeOne');
 expect(metadataFor('/create').title).toBe('Your video workspace | TakeOne');
 expect(metadataFor('/review')).toMatchObject({ title: 'Review a video | TakeOne', robots: 'noindex, nofollow' });
 const collection = structuredDataFor('/guides')[0];
 expect(collection).toMatchObject({ '@type': 'CollectionPage', mainEntity: { itemListElement: guides.map((guide, index) => ({ '@type': 'ListItem', position: index + 1, name: guide.title, url: siteUrl + guide.path })) } });
});

test('social type resets when navigating away from a guide', async () => {
 render(<MemoryRouter initialEntries={['/guides/change-video-speed/']}><PageMetadata /><Link to="/guides">Guides</Link></MemoryRouter>);
 await waitFor(() => expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('article'));
 fireEvent.click(screen.getByText('Guides'));
 await waitFor(() => expect(document.querySelector('meta[property="og:type"]')?.getAttribute('content')).toBe('website'));
});

test('guide index exposes all tutorial links and one heading', () => {
 render(<MemoryRouter initialEntries={['/guides']}><Guides /></MemoryRouter>);
 expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
 for (const guide of guides) expect(screen.getByRole('link', { name: guide.title }).getAttribute('href')).toBe(guide.path);
});
