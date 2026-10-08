# frozen_string_literal: true

require "date"
require "yaml"

errors = []

Dir.glob("_posts/*.{md,markdown}").sort.each do |path|
  filename = File.basename(path)
  filename_match = filename.match(/\A(\d{4}-\d{2}-\d{2})-.+\.(?:md|markdown)\z/)
  unless filename_match
    errors << "#{path}: filename must start with YYYY-MM-DD-"
  end
  filename_date = if filename_match
                    begin
                      Date.iso8601(filename_match[1])
                    rescue Date::Error
                      errors << "#{path}: filename date must be a valid ISO date"
                      nil
                    end
                  end

  content = File.read(path)
  front_matter = content.match(/\A---\s*\n(.*?)\n---\s*(?:\n|\z)/m)
  unless front_matter
    errors << "#{path}: missing YAML front matter"
    next
  end

  begin
    metadata = YAML.safe_load(
      front_matter[1],
      permitted_classes: [Date, Time],
      aliases: false
    )
  rescue Psych::Exception => e
    errors << "#{path}: invalid YAML front matter (#{e.message.lines.first.strip})"
    next
  end

  unless metadata.is_a?(Hash)
    errors << "#{path}: front matter must be a YAML mapping"
    next
  end

  unless metadata["title"].is_a?(String) && !metadata["title"].strip.empty?
    errors << "#{path}: title must be a non-empty string"
  end

  if metadata["date"].is_a?(Date) || metadata["date"].is_a?(Time)
    if filename_date && metadata["date"].to_date != filename_date
      errors << "#{path}: filename date must match the front matter date"
    end
  else
    errors << "#{path}: date must be a valid date or timestamp"
  end

  %w[categories tags].each do |key|
    next unless metadata.key?(key)

    values = metadata[key]
    unless values.is_a?(Array) && values.all? { |value| value.is_a?(String) && !value.strip.empty? }
      errors << "#{path}: #{key} must be a list of non-empty strings"
    end
  end
end

if errors.empty?
  puts "Validated #{Dir.glob('_posts/*.{md,markdown}').length} posts."
else
  warn errors.join("\n")
  exit 1
end
