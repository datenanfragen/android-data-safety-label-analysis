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
