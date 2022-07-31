create table top_charts
(
    chart     text    not null,
    date      date    not null,
    position  integer not null,
    app_id    text    not null,
    rating    double precision,
    category  text    not null,
    price     text,
    downloads text    not null,
    constraint top_charts_pk
        primary key (chart, date, position)
);

alter table top_charts
    owner to dsl;

create table labels
(
    app_id             text not null,
    date               date not null,
    name               text,
    developer          jsonb,
    icon_url           text,
    privacy_policy_url text,
    data_shared        jsonb,
    data_collected     jsonb,
    security_practices jsonb,
    constraint labels_pk
        primary key (app_id, date)
);

alter table labels
    owner to dsl;

create table apps
(
    id      serial
        constraint apps_pk
            primary key,
    name    text not null,
    version text not null,
    unique (name, version)
);

alter table apps
    owner to dsl;

create table runs
(
    id         serial
        constraint run_pk
            primary key,
    start_time timestamp with time zone,
    end_time   timestamp with time zone,
    app        integer not null
        unique
        constraint runs_apps_id_fk
            references apps
            on delete cascade
);

alter table runs
    owner to dsl;

create table requests
(
    id           serial
        constraint request_pk
            primary key,
    run          integer
        constraint request_run_id_fk
            references runs
            on delete cascade,
    start_time   timestamp with time zone not null,
    method       varchar(10)              not null,
    host         text                     not null,
    path         text                     not null,
    content      text,
    content_raw  bytea                    not null,
    port         integer,
    scheme       text                     not null,
    authority    text,
    http_version text                     not null
);

alter table requests
    owner to dsl;

create table headers
(
    id      serial
        constraint headers_pk
            primary key,
    request integer
        constraint table_name_requests_id_fk
            references requests
            on delete cascade,
    name    text not null,
    values  text[]
);

alter table headers
    owner to dsl;

create table cookies
(
    id      serial
        constraint cookies_pk
            primary key,
    request integer
        constraint table_name_requests_id_fk
            references requests
            on delete cascade,
    name    text not null,
    values  text[]
);

alter table cookies
    owner to dsl;

create table trailers
(
    id      serial
        constraint trailers_pk
            primary key,
    request integer
        constraint table_name_requests_id_fk
            references trailers
            on delete cascade,
    name    text not null,
    values  text[]
);

alter table trailers
    owner to dsl;


-- This schema is based on the work for the "Do they track? Automated analysis of Android apps for privacy violations"
-- research project (https://benjamin-altpeter.de/doc/presentation-android-privacy.pdf). The initial version is
-- licensed under the following license:
--
-- The MIT License
--
-- Copyright 2020 – 2021 Malte Wessels
--
-- Permission is hereby granted, free of charge, to any person obtaining a copy
-- of this software and associated documentation files (the "Software"), to deal
-- in the Software without restriction, including without limitation the rights
-- to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
-- copies of the Software, and to permit persons to whom the Software is
-- furnished to do so, subject to the following conditions:
--
-- The above copyright notice and this permission notice shall be included in all
-- copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
-- IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
-- FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
-- AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
-- LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
-- OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
-- SOFTWARE.
