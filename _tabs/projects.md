---
title: Projects
icon: fas fa-code
order: 2
description: Selected fullstack, mobile, and backend products built across education, business platforms, and restaurant discovery.
---

<p class="projects-intro">I’ve led and contributed to production products at A3T Solutions, Uri Creative, and Pengrid Technologies. These selected examples reflect my work across education, event-driven platforms, mobile learning, and global restaurant discovery. Some implementation details are private, so the summaries focus on product scope and engineering contributions.</p>

<div class="projects-grid" aria-label="Selected software projects">
  <article class="project-card">
    <div class="project-card__topline"><span class="project-card__number">01</span><span class="project-card__type">Business platform · Recent project</span></div>
    <h2>NIS Store Management Information System</h2>
    <p class="project-card__summary">A business platform supporting store operations, inventory, requisitions, approvals, dispatch, assets, and organizational structures.</p>
    <h3>Engineering focus</h3>
    <ul><li>Modular architecture and role-based access</li><li>Workflow design and organizational hierarchy</li><li>Audit logging, imports, reporting, and APIs</li></ul>
    <div class="project-card__stack" aria-label="Technology stack"><span>TypeScript</span><span>NestJS</span><span>Next.js</span><span>PostgreSQL</span><span>Prisma</span><span>Redis</span></div>
  </article>

  <article class="project-card">
    <div class="project-card__topline"><span class="project-card__number">02</span><span class="project-card__type">Multi-tenant SaaS · A3T Solutions</span></div>
    <h2>Multi-Tenant School Management Platform</h2>
    <p class="project-card__summary">A centralized platform for multiple schools to manage students, staff, examinations, attendance, fees, and academic records.</p>
    <h3>Engineering focus</h3>
    <ul><li>Tenant-isolated APIs and configurable academic workflows</li><li>Role-based access control across schools</li><li>Responsive web interfaces and APIs for thousands of student and administrative records</li></ul>
    <div class="project-card__stack" aria-label="Technology stack"><span>TypeScript</span><span>React</span><span>Next.js</span><span>Express</span><span>MongoDB</span></div>
  </article>

  <article class="project-card">
    <div class="project-card__topline"><span class="project-card__number">03</span><span class="project-card__type">School platform · A3T Solutions</span></div>
    <h2>Single-School Management Platform</h2>
    <p class="project-card__summary">A role-based platform for student records, admissions, examinations, attendance, result processing, and academic administration.</p>
    <h3>Engineering focus</h3>
    <ul><li>Secure authentication, RBAC and ABAC authorization, rate limiting, and validation</li><li>Test-driven development and automated unit tests to improve product stability</li><li>Collaboration with stakeholders and engineers to deliver school requirements</li></ul>
    <div class="project-card__stack" aria-label="Technology stack"><span>TypeScript</span><span>React</span><span>Next.js</span><span>Express</span><span>MongoDB</span></div>
  </article>

  <article class="project-card">
    <div class="project-card__topline"><span class="project-card__number">04</span><span class="project-card__type">Mobile learning · A3T Solutions</span></div>
    <h2>KlazikExams</h2>
    <p class="project-card__summary">A cross-platform exam preparation app serving secondary and tertiary students and professionals preparing for examinations.</p>
    <h3>Engineering focus</h3>
    <ul><li>End-to-end development of authentication, assessments, and content management</li><li>Progress tracking and performance analytics integrated with REST APIs</li><li>Reusable app architecture and performance across Android and iOS</li></ul>
    <div class="project-card__stack" aria-label="Technology stack"><span>React Native</span><span>Expo</span><span>TypeScript</span><span>REST APIs</span></div>
  </article>

  <article class="project-card">
    <div class="project-card__topline"><span class="project-card__number">05</span><span class="project-card__type">Distributed platform · Uri Creative</span></div>
    <h2>Event-Driven Notification &amp; Reporting Platform</h2>
    <p class="project-card__summary">Distributed services supporting business events, asynchronous notifications, background processing, and operational reporting.</p>
    <h3>Engineering focus</h3>
    <ul><li>Queue-based CSV and PDF exports with cloud storage integrations</li><li>Secure file uploads, JWT authentication, RBAC and ABAC</li><li>Centralized audit logging and exception management</li><li>Backend services handling thousands of daily API requests</li></ul>
    <div class="project-card__stack" aria-label="Technology stack"><span>NestJS</span><span>PostgreSQL</span><span>Redis</span><span>Azure Service Bus</span><span>Azure</span><span>React</span><span>Next.js</span></div>
  </article>

  <article class="project-card project-card--wide">
    <div class="project-card__topline"><span class="project-card__number">06</span><span class="project-card__type">Discovery &amp; delivery · Pengrid Technologies</span></div>
    <h2>INU Restaurant &amp; Venue Discovery</h2>
    <p class="project-card__summary">A global platform helping Black diners, foodies, and allies discover inclusive, high-quality restaurants, with a backend foundation for multi-vendor food delivery.</p>
    <h3>Engineering focus</h3>
    <ul><li>Backend architecture and domain models for restaurants, vendors, menus, orders, reviews, ratings, recommendations, and profiles</li><li>Google Maps integration for geolocation discovery, address management, and location-based features</li><li>Secure authentication, role-based authorization, audit trails, notifications, and scalable API access controls</li></ul>
  </article>
</div>

<section class="projects-next" aria-label="Next steps">
  <p>Want to discuss my experience or a role?</p>
  <a href="{{ '/resume/' | relative_url }}">View résumé <span aria-hidden="true">→</span></a>
  <span aria-hidden="true">·</span>
  <a href="mailto:{{ site.social.email }}">Get in touch</a>
</section>
