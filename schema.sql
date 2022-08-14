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

create view filtered_requests as
select name, version, requests.*, regexp_replace(concat(requests.scheme, '://', requests.host, requests.path), '\?.+$', '') endpoint_url from apps
    join runs r on apps.id = r.app join requests on r.id = requests.run where

    not (requests.host = 'android.clients.google.com' and requests.path = '/c2dm/register3')
    and not (requests.host = 'android.googleapis.com' and requests.path = '/auth/devicekey')
    and not (requests.host ~~ '%.googleapis.com' and requests.path ~~ '/google.internal%')
    and not (requests.host ~~ 'www.googleapis.com' and requests.path ~~ '/androidantiabuse/%')
    and not (requests.host ~~ 'www.googleapis.com' and requests.path ~~ '/androidcheck/v1/attestations%')
    and not (requests.host ~~ 'play.googleapis.com' and requests.path = '/log/batch')
    and not (requests.host ~~ 'www.googleapis.com' and requests.path ~~ '/experimentsandconfigs/%')
    and not requests.host = '172.217.19.74'
    and not (requests.host ~~ 'firebaseinstallations.googleapis.com' and
            requests.path ~~ '/v1/projects/google.com%')
    and not (requests.host ~~ 'firebaseinstallations.googleapis.com' and
            requests.path ~~ '/v1/projects/metal-dimension-646%')
    and not (requests.host ~~ 'firebaseinstallations.googleapis.com' and
            requests.path ~~ '/v1/projects/zillatest-20296%')
    and not (requests.host ~~ '%gvt1.com' and requests.path ~~ '/edgedl/%')
    and not requests.host ~~ 'update.googleapis.com'
    and not (requests.host ~~ 'www.gstatic.com' and requests.path ~~ '/android%')
    and not (requests.host = 'www.google.com' and requests.path = '/loc/m/api')
    and not (requests.host = 'ssl.gstatic.com' and requests.path ~ '/suggest-dev/yt')
    and not (requests.host = 'android.googleapis.com' and requests.path = '/checkin')
    and not (requests.host = 'www.gstatic.com' and requests.path ~ '/commerce/wallet')
    and not (requests.host = 'app-measurement.com' and
            requests.path ~ '/config/app/1%3A357317899610%3Aandroid%3A4765c0ded882c665')
    and not (requests.host = 'app-measurement.com' and
            requests.path ~ '/config/app/1%3A1086610230652%3Aandroid%3A131e4c3db28fca84')
    and not (requests.host = 'ssl.google-analytics.com' and requests.content ~ 'UA-61414137-1')
    and not (requests.host = 'www.googletagmanager.com' and requests.content ~ 'GTM-K9CNX3')
    and not requests.host = 'accounts.google.com'
    and not requests.host = 'safebrowsing.googleapis.com'
    and not requests.path ~ '/v1/projects/chime-sdk/installations'
    -- plenty of system apps also transmit to app-measurement.com. This way, we only filter out those caused by our
    -- current app.
    and not (requests.host = 'app-measurement.com' and not encode(requests.content_raw, 'escape') like concat('%', apps.name, '%'));

alter table filtered_requests owner to dsl;

-- This schema and the filter view are based on the work for the "Do they track? Automated analysis of Android apps for
-- privacy violations" research project (https://benjamin-altpeter.de/doc/presentation-android-privacy.pdf). The initial
-- version is licensed under the following license:
--
-- The MIT License
--
-- Copyright 2020 – 2021 Malte Wessels and Benjamin Altpeter
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
